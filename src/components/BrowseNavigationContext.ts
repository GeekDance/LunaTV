'use client';

import { createContext } from 'react';

// Only the mounted workspace can service native-history transitions.
export const BrowseNavigationContext = createContext(false);
