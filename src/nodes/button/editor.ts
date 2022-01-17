import { EditorNodeDef, EditorNodeProperties, EditorRED } from 'node-red';

import * as exposeNode from '../../editor/exposenode';
import * as ha from '../../editor/ha';
import * as nodeVersion from '../../editor/nodeversion';
import * as haOutputs from '../../editor/output-properties';
import { OutputProperty } from '../../editor/types';

declare const RED: EditorRED;

interface ButtonEditorNodeProperties extends EditorNodeProperties {
    version: number;
    debugenabled: boolean;
    entityConfig: any;
    outputProperties: OutputProperty[];
}

const ButtonEditor: EditorNodeDef<ButtonEditorNodeProperties> = {
    category: 'home_assistant_entities',
    color: ha.nodeColors.beta,
    inputs: 0,
    outputs: 1,
    icon: 'font-awesome/fa-hand-o-up',
    align: 'left',
    paletteLabel: 'button',
    label: function () {
        return this.name || 'button';
    },
    labelStyle: ha.labelStyle,
    defaults: {
        name: { value: '' },
        version: { value: RED.settings.get('haButtonVersion', 0) },
        debugenabled: { value: false },
        outputs: { value: 1 },
        entityConfig: {
            value: '',
            type: 'ha-entity-config',
            // @ts-ignore - DefinitelyTyped is missing this property
            filter: (config) => config.entityType === 'button',
            required: true,
        },
        outputProperties: {
            value: [
                {
                    property: 'payload',
                    propertyType: 'msg',
                    value: '',
                    valueType: 'entityState',
                },
                {
                    property: 'topic',
                    propertyType: 'msg',
                    value: '',
                    valueType: 'triggerId',
                },
                {
                    property: 'data',
                    propertyType: 'msg',
                    value: '',
                    valueType: 'entity',
                },
            ],
            validate: haOutputs.validate,
        },
    },
    oneditprepare: function () {
        nodeVersion.check(this);
        exposeNode.init(this);
        $('#dialog-form').prepend(ha.betaWarning(546));

        haOutputs.createOutputs(this.outputProperties, {
            extraTypes: ['entity', 'entityState', 'entityId'],
        });
    },
    oneditsave: function () {
        this.outputProperties = haOutputs.getOutputs();
    },
};

export default ButtonEditor;