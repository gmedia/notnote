import { describe, expect, it } from 'vitest';
import { WEB_APP_NAME, WEB_ROUTES } from '../src/index';

describe('web app contract', () => {
  it('names the app', () => {
    expect(WEB_APP_NAME).toContain('NotNote');
  });

  it('reserves the page and database routes', () => {
    expect(WEB_ROUTES).toContain('/page/:pageId');
    expect(WEB_ROUTES).toContain('/database/:databaseId');
  });
});
