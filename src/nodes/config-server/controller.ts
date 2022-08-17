import {
    HassEntity as HomeAssistantEntity,
    HassServices,
} from 'home-assistant-js-websocket';
import { Node } from 'node-red';

import { EventsList } from '../../common/events/Events';
import { IntegrationEvent } from '../../common/Integration';
import { HA_EVENT_SERVICES_UPDATED } from '../../const';
import { RED } from '../../globals';
import {
    addEventListeners,
    removeEventListeners,
    toCamelCase,
} from '../../helpers/utils';
import {
    createHomeAssistantClient,
    Credentials,
    SUPERVISOR_URL,
} from '../../homeAssistant';
import HomeAssistant from '../../homeAssistant/HomeAssistant';
import { ClientEvent } from '../../homeAssistant/Websocket';
import { HassEntity, HassStateChangedEvent } from '../../types/home-assistant';
import { ServerNode, ServerNodeConfig } from '../../types/nodes';
import Comms from './Comms';

type HomeAssistantStatesContext = { [entity_id: string]: HomeAssistantEntity };

type HomeAssistantServerContext = {
    states: HomeAssistantStatesContext;
    services: HassServices;
    isConnected: boolean;
    isRunning: boolean;
};

type HomeAssistantGlobalContext = {
    [serverName: string]: HomeAssistantServerContext;
};

type ExposedNodes = {
    [nodeId: string]: boolean;
};

export default class ConfigServer {
    node: Node<Credentials>;
    config: ServerNodeConfig;
    events: EventsList = [];
    homeAssistant?: HomeAssistant;
    comms?: Comms;
    exposedNodes: ExposedNodes = {};
    isHomeAssistantRunning = false;

    constructor(node: ServerNode<Credentials>) {
        this.node = node;
        this.config = node.config;

        this.setOnContext('states', {});
        this.setOnContext('services', {});
        this.setOnContext('isConnected', false);

        node.on('close', this.onClose.bind(this));
    }

    get hostname() {
        return this.config.addon ? SUPERVISOR_URL : this.node.credentials.host;
    }

    async init() {
        try {
            this.homeAssistant = createHomeAssistantClient(
                this.config,
                this.node.credentials
            );

            this.startListeners();
            this.comms = new Comms(this.homeAssistant, this.node.id);

            await this.homeAssistant.websocket.connect();
        } catch (e: unknown) {
            if (e instanceof Error) {
                this.node.error(RED._(e.message, { base_url: this.hostname }));
            } else {
                this.node.error(e);
            }
        }
    }

    startListeners() {
        // Setup event listeners
        this.events = [
            [ClientEvent.Close, this.onHaEventsClose],
            [ClientEvent.Open, this.onHaEventsOpen],
            [ClientEvent.Connecting, this.onHaEventsConnecting],
            [ClientEvent.Error, this.onHaEventsError],
            [ClientEvent.Running, this.onHaEventsRunning],
            [ClientEvent.StatesLoaded, this.onHaStatesLoaded],
            [ClientEvent.ServicesLoaded, this.onHaServicesLoaded],
            [HA_EVENT_SERVICES_UPDATED, this.onHaServicesUpdated],
            ['ha_events:state_changed', this.onHaStateChanged],
            ['integration', this.onIntegrationEvent],
        ];
        addEventListeners(this.events, this?.homeAssistant?.eventBus);
        this?.homeAssistant?.addListener(
            ClientEvent.Connected,
            this.registerEvents,
            { once: true }
        );
    }

    get nameAsCamelcase() {
        return toCamelCase(this.config.name);
    }

    setOnContext(key: keyof HomeAssistantServerContext, value: any) {
        const haCtx =
            (this.node.context().global.get('homeassistant') as
                | HomeAssistantGlobalContext
                | undefined) ?? {};
        haCtx[this.nameAsCamelcase] ??= {
            states: {} as HomeAssistantStatesContext,
            services: {} as HassServices,
            isConnected: false,
            isRunning: false,
        };
        haCtx[this.nameAsCamelcase][key] = value;
        this.node.context().global.set('homeassistant', haCtx);
    }

    getFromContext(key: keyof HomeAssistantServerContext) {
        const haCtx = this.node
            .context()
            .global.get('homeassistant') as HomeAssistantGlobalContext;
        return haCtx?.[this.nameAsCamelcase]?.[key];
    }

    // Close WebSocket client on redeploy or node-RED shutdown
    onClose(removed: boolean, done: (err?: Error) => void) {
        if (this.homeAssistant) {
            // Remove event listeners
            removeEventListeners(this.events, this.homeAssistant.eventBus);
            this.node.log(`Closing connection to ${this.hostname}`);
            this.homeAssistant.close();
        }
        done();
    }

    onHaEventsOpen = () => {
        this.setOnContext('isConnected', true);

        this.node.log(`Connected to ${this.hostname}`);
    };

    onHaStateChanged = (changedEntity: HassStateChangedEvent) => {
        const states = this.getFromContext(
            'states'
        ) as HomeAssistantStatesContext;
        if (states) {
            states[changedEntity.entity_id] = changedEntity.event
                .new_state as HomeAssistantEntity;
            this.setOnContext('states', states);
        }
    };

    onHaStatesLoaded = (states: HassEntity[]) => {
        this.setOnContext('states', states);
        this.node.debug('States Loaded');
    };

    onHaServicesLoaded = () => {
        this.node.debug('Services Loaded');
    };

    onHaServicesUpdated = (services: HassServices) => {
        this.setOnContext('services', services);
    };

    onHaEventsConnecting = () => {
        this.setOnContext('isConnected', false);
        this.setOnContext('isRunning', false);
        this.node.log(`Connecting to ${this.hostname}`);
    };

    onHaEventsClose = () => {
        if (this.getFromContext('isConnected')) {
            this.node.log(`Connection closed to ${this.hostname}`);
        }
        this.setOnContext('isConnected', false);
        this.setOnContext('isRunning', false);
    };

    onHaEventsRunning = () => {
        this.setOnContext('isRunning', true);
        this.node.debug(`HA State: running`);
    };

    onHaEventsError = (err: Error) => {
        this.setOnContext('isConnected', false);
        this.setOnContext('isRunning', false);
        this.node.debug(err);
    };

    onIntegrationEvent = (eventType: IntegrationEvent) => {
        if (
            eventType === IntegrationEvent.NotLoaded &&
            !this.isHomeAssistantRunning
        ) {
            return;
        }
        this.node.debug(`Integration: ${eventType}`);
    };

    registerEvents = () => {
        this?.homeAssistant?.subscribeEvents();
    };
}
