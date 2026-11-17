import { getAvailableApiSites, getConfig } from './config';
import { searchPageFromApi } from './downstream';
import type { SearchManifest, SearchPageResponse } from './search-page.types';
import { yellowWords } from './yellow';

export class SearchRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function getAccess(username?: string) {
  if (!username) throw new SearchRequestError(401, 'Unauthorized');
  const config = await getConfig();
  if (username !== process.env.USERNAME) {
    const user = config.UserConfig.Users.find(
      (entry) => entry.username === username
    );
    if (!user || user.banned) throw new SearchRequestError(403, 'Forbidden');
  }
  const sites = await getAvailableApiSites(username);
  const configured = config.SiteConfig.SearchDownstreamMaxPage;
  const maxPages =
    Number.isFinite(configured) && configured >= 1 ? Math.floor(configured) : 1;
  return { config, sites, maxPages };
}

export async function getSearchManifest(
  username?: string
): Promise<SearchManifest> {
  const { sites, maxPages } = await getAccess(username);
  return { sources: sites.map(({ key, name }) => ({ key, name })), maxPages };
}

export async function searchSourcePage(
  username: string | undefined,
  query: string,
  source: string,
  page: number
): Promise<SearchPageResponse> {
  const { config, sites, maxPages } = await getAccess(username);
  if (!query.trim() || !Number.isInteger(page) || page < 1 || page > maxPages) {
    throw new SearchRequestError(400, 'Invalid query or page');
  }
  const site = sites.find((entry) => entry.key === source);
  if (!site) throw new SearchRequestError(403, 'Source unavailable');
  const outcome = await searchPageFromApi(site, query.trim(), page);
  const results = config.SiteConfig.DisableYellowFilter
    ? outcome.results
    : outcome.results.filter(
        (result) =>
          !yellowWords.some((word) => (result.type_name || '').includes(word))
      );
  return { ...outcome, source, page, results };
}
