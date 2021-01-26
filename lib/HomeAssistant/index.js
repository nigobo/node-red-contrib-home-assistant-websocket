'use strict';
const url = require('url');
const { EventEmitter } = require('events');

const HomeAssistant = require('./HomeAssistant');
const HttpAPI = require('./Http');
const WebsocketAPI = require('./Websocket');

function createHomeAssistantClient(config, credentials) {
    const creds = createCredentials(credentials);
    const httpConfig = createHttpConfig(config, creds);
    const websocketConfig = createWebsocketConfig(config, creds);
    const eventBus = new EventEmitter();
    eventBus.setMaxListeners(0);
    const httpAPI = new HttpAPI(httpConfig);
    const websocketAPI = new WebsocketAPI(websocketConfig, eventBus);

    return new HomeAssistant({ websocketAPI, httpAPI, eventBus });
}

function createCredentials(credentials) {
    const url = getBaseUrl(credentials.host);
    const creds = {
        url,
        apiPass: credentials.access_token,
    };
    return creds;
}

function createHttpConfig(
    config = { legacy: false, rejectUnauthorizedCerts: true },
    credentials
) {
    return {
        apiPass: credentials.apiPass,
        baseUrl: credentials.url,
        legacy: config.legacy,
        rejectUnauthorizedCerts: config.rejectUnauthorizedCerts,
    };
}

function createWebsocketConfig(
    config = { legacy: false, rejectUnauthorizedCerts: true },
    credentials
) {
    return {
        apiPass: credentials.apiPass,
        baseUrl: credentials.url,
        legacy: config.legacy,
        rejectUnauthorizedCerts: config.rejectUnauthorizedCerts,
        connectionDelay: config.connectionDelay,
    };
}

function getBaseUrl(url) {
    const baseUrl = url.trim();
    const errorMessage = validateBaseUrl(baseUrl);
    if (errorMessage) {
        throw new Error(errorMessage);
    }

    return baseUrl;
}

function validateBaseUrl(baseUrl) {
    if (!baseUrl) {
        return 'config-server.errors.empty_base_url';
    }

    let parsedUrl;
    try {
        // eslint-disable-next-line no-new
        parsedUrl = new url.URL(baseUrl);
    } catch (e) {
        return 'config-server.errors.invalid_base_url';
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return 'config-server.errors.invalid_protocol';
    }
}

module.exports = createHomeAssistantClient;