import './core/debug-log';
import './core/http';
import './core/settings';
import './core/paging';
import './core/immich-client';
import './core/auth';

const core = window.ImmichCore;
const settings = core.settings.create(core.settings.defaultStorage());
core.debugLog.setEnabled(settings.getDebugEnabled());
const client = core.immichClient.create({http: core.http, getConfig: settings.getCredentials});
const auth = core.auth.create({client, settings});

export default {settings, client, auth, paging: core.paging, debugLog: core.debugLog};
