(function (w) {
  'use strict';
  var ui = w.ImmichUI, core = w.ImmichCore;

  var settings = core.settings.create(core.settings.defaultStorage());
  var client = core.immichClient.create({ http: core.http, getConfig: settings.getCredentials });
  var auth = core.auth.create({ client: client, settings: settings });
  var ctx = { settings: settings, client: client, auth: auth, app: ui.app };

  ui.app.register('setup', ui.createSetupView(ctx));
  ui.app.register('albums', ui.createAlbumsView(ctx));
  ui.app.register('album', ui.createAlbumView(ctx));
  ui.app.register('viewer', ui.createViewerView(ctx));
  ui.app.register('settings', ui.createSettingsView(ctx));

  ui.app.start(auth.isConfigured() ? 'albums' : 'setup');
}(window));
