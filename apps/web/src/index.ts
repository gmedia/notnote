export const WEB_APP_NAME = 'NotNote Web';

export const WEB_ROUTES = [
  '/',
  '/login',
  '/workspace/:workspaceId',
  '/page/:pageId',
  '/database/:databaseId',
  '/settings',
] as const;

export type WebRoute = (typeof WEB_ROUTES)[number];
