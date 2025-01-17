const Joi = require('joi');
const selectn = require('selectn');
const { shuffle } = require('lodash');

const BaseNode = require('../BaseNode');

const nodeOptions = {
    debug: true,
    config: {
        server: { isNode: true },
        name: {},
        rules: {},
        output_type: {},
        output_empty_results: {},
        output_location_type: {},
        output_location: {},
        output_results_count: {},
    },
    input: {
        outputType: {
            messageProp: 'payload.outputType',
            configProp: 'output_type',
            default: 'array',
            validation: {
                haltOnFail: true,
                schema: Joi.string()
                    .valid('array', 'count', 'random', 'split')
                    .label('OutputType'),
            },
        },
        outputEmptyResults: {
            messageProp: 'payload.outputEmptyResults',
            configProp: 'output_empty_results',
            default: false,
            validation: {
                haltOnFail: true,
                schema: Joi.boolean().label('outputEmptyResults'),
            },
        },
        outputLocationType: {
            messageProp: 'payload.outputLocationType',
            configProp: 'output_location_type',
            default: 'msg',
            validation: {
                haltOnFail: true,
                schema: Joi.string()
                    .valid('array', 'msg', 'flow', 'global')
                    .label('outputLocationType'),
            },
        },
        outputLocation: {
            messageProp: 'payload.outputLocation',
            configProp: 'output_location',
            default: 'payload',
            validation: {
                haltOnFail: true,
                schema: Joi.string().label('outputLocation'),
            },
        },
        outputResultsCount: {
            messageProp: 'payload.outputResultsCount',
            configProp: 'output_results_count',
            default: 1,
            validation: {
                haltOnFail: true,
                schema: Joi.number().label('outputResultsCount'),
            },
        },
        rules: {
            messageProp: 'payload.rules',
            configProp: 'rules',
            default: [],
            validation: {
                haltOnFail: true,
                schema: Joi.array()
                    .items(
                        Joi.object({
                            property: Joi.when('logic', {
                                is: 'jsonata',
                                then: Joi.any(),
                                otherwise: Joi.string(),
                            }),
                            logic: Joi.string().valid(
                                'is',
                                'is_not',
                                'lt',
                                'lte',
                                'gt',
                                'gte',
                                'includes',
                                'does_not_include',
                                'starts_with',
                                'in_group',
                                'jsonata'
                            ),
                            value: Joi.string(),
                            valueType: Joi.string().valid(
                                'str',
                                'num',
                                'bool',
                                're',
                                'jsonata',
                                'msg',
                                'flow',
                                'global',
                                'entity'
                            ),
                        })
                    )
                    .label('rules'),
            },
        },
    },
};

class GetEntities extends BaseNode {
    constructor({ node, config, RED, status }) {
        super({ node, config, RED, status, nodeOptions });
    }

    /* eslint-disable camelcase */
    onInput({ message, parsedMessage, send, done }) {
        let noPayload = false;

        if (this.nodeConfig.server === null) {
            done('No valid server selected.');
            return;
        }

        const states = this.homeAssistant.getStates();
        if (!states) {
            send({ payload: {} });
            done('local state cache missing sending empty payload');
        }

        let entities;
        try {
            entities = Object.values(states).filter((entity) => {
                const rules = parsedMessage.rules.value;

                entity.timeSinceChangedMs =
                    Date.now() - new Date(entity.last_changed).getTime();

                for (const rule of rules) {
                    const value = selectn(rule.property, entity);
                    const result = this.getComparatorResult(
                        rule.logic,
                        rule.value,
                        value,
                        rule.valueType,
                        {
                            message,
                            entity,
                        }
                    );
                    if (
                        (rule.logic !== 'jsonata' && value === undefined) ||
                        !result
                    ) {
                        return false;
                    }
                }

                return true;
            });
        } catch (e) {
            this.status.setFailed('Error');
            done(e.message);
            return;
        }

        let statusText = `${entities.length} entities`;
        let payload = {};

        switch (parsedMessage.outputType.value) {
            case 'count':
                payload = entities.length;
                break;
            case 'split':
                if (entities.length === 0) {
                    noPayload = true;
                    break;
                }

                this.status.setSuccess(statusText);
                this.sendSplit(message, entities, send);
                done();
                return;
            case 'random': {
                if (entities.length === 0) {
                    noPayload = true;
                    break;
                }
                const maxReturned =
                    Number(parsedMessage.outputResultsCount.value) || 1;

                const max =
                    entities.length <= maxReturned
                        ? entities.length
                        : maxReturned;
                const shuffledEntities = shuffle(entities);
                payload = shuffledEntities.slice(0, max);
                if (maxReturned === 1) {
                    payload = payload[0];
                }
                statusText = `${maxReturned === 1 ? 1 : payload.length} Random`;
                break;
            }
            case 'array':
            default:
                if (
                    entities.length === 0 &&
                    !parsedMessage.outputEmptyResults.value
                ) {
                    noPayload = true;
                }

                payload = entities;
                break;
        }

        if (noPayload) {
            this.status.setFailed('No Results');
            done();
            return;
        }

        this.status.setSuccess(statusText);

        this.setContextValue(
            payload,
            parsedMessage.outputLocationType.value,
            parsedMessage.outputLocation.value,
            message
        );

        send(message);
        done();
    }
}

module.exports = GetEntities;
