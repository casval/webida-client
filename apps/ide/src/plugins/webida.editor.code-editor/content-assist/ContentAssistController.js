/*
* Copyright (c) 2012-2015 S-Core Co., Ltd.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

/**
 * Constructor function
 * ContentAssistController  class
 * Content assist controller module.
 *
 * @constructor
 * @since: 2015.10.11
 * @author: h.m.kwom
 *
 */

// @formatter:off
define([
    'external/codemirror/lib/codemirror',
    'external/URIjs/src/URI',
    'require',
    'webida-lib/plugin-manager-0.1',
    'webida-lib/util/genetic',    
    'webida-lib/util/logger/logger-client',
    './ContentAssistControl'
], function (
    codemirror,
    URI,
    require,
    pluginManager,
    genetic,
    Logger,
    ContentAssistControl
) {
    'use strict';
    // @formatter:on
    
    var logger = new Logger();
    logger.off(); 
        
    var extensionPoints = {
        CODEEDITOR_CONTENT_ASSIST: 'webida.editor.code-editor:contentassist'
    };
    
    var caExtensions = pluginManager.getExtensions(extensionPoints.CODEEDITOR_CONTENT_ASSIST);
    
    var caExtensionInfos = [];   
    var caControlConstructors = [];    
    
    var promiseForExtensionsInfo;

    function extractModulePath(ext, property) {
        if (typeof ext[property] === 'string') {
            if (ext[property] !== '') {
                var path = URI(ext[property]).absoluteTo(ext.__plugin__.loc + '/').toString();
                return path;
            } else {
                console.error('Null string.'); 
            }
        } else {
            console.error('Type of ext[' + property + '] should be string.');
        }
    }
    
    function loadCaControlsConstructors() {
        var promisesForConstructors = [];
        
        promiseForExtensionsInfo = new Promise(function (resolve, reject) {
            
            caExtensions.forEach(function (ext) {
                var caExtensionInfo = {};            
                var controlModulePath = extractModulePath(ext, 'controlModule');
                var engineModulePath = extractModulePath(ext, 'engineModule');

                caExtensionInfo.langMode = ext.langMode;
                caExtensionInfo.engineName = ext.engineName;
                caExtensionInfo.engineModulePath = engineModulePath; 
                caExtensionInfo.controlModulePath = controlModulePath;
                caExtensionInfos.push(caExtensionInfo);
                
                promisesForConstructors.push(new Promise(function (resolve1, reject1) {
                    require([controlModulePath], function (CaControlConstructor) {
                        CaControlConstructor.ENGINE_NAME = caExtensionInfo.engineName;
                        CaControlConstructor.TARGET_MODE = caExtensionInfo.langMode;
                        caControlConstructors.push(CaControlConstructor);
                        resolve1('A CA control module constructor loaded');
                    });
                }));
            });

            Promise.all(promisesForConstructors).then(function (values) {
                resolve('CA constructors loading is completed');
            });

            
        });      
      
    }
    
    loadCaControlsConstructors();

    function ContentAssistController(viewer, cm, options, c) {
        logger.info('new ContentAssistController()');

        var that = this;
        var promises = [promiseForExtensionsInfo];      
        
        this.controls = [];
        cm._contentAssistController = that;
        
        promises.push(new Promise(function (resolve, reject) {
            caControlConstructors.forEach(function (CaControlConstructor) {
                that.controls.push(new CaControlConstructor(viewer, cm, options, function () {
                    resolve('ContentAssistControl created');
                }));
            });
        }));     
        
        Promise.all(promises).then(function (values) {
            viewer.addExtraKeys({
                'Ctrl-I': 'jsca-showtype',
                'Alt-.': 'jsca-gotodefinition',
                'Alt-,': 'jsca-jumpback',
                // 'Ctrl-B': 'jsca-showreference'
            });
            if (c) {
                c();
            }
        });
    }

    function jshint(cm, callback) {
        if (cm._contentAssistController) {
            cm._contentAssistController.execCommand('getHint', cm, callback);
        }
    }

    function setCodemirrorCommandsAndHelpers() {
        codemirror.commands['jsca-showtype'] = function (cm) {
            cm._contentAssistController.execCommand('showType', cm);           
        };
        codemirror.commands['jsca-gotodefinition'] = function (cm) {
            cm._contentAssistController.execCommand('jumpToDef', cm);
        };
        codemirror.commands['jsca-jumpback'] = function (cm) {
            cm._contentAssistController.execCommand('jumpBack', cm);
        };
        codemirror.commands['jsca-rename'] = function (cm) {
            cm._contentAssistController.execCommand('rename', cm);
        };

        codemirror.registerHelper('hint', 'javascript', jshint);        
    }

    setCodemirrorCommandsAndHelpers();

    genetic.inherits(ContentAssistController, ContentAssistControl, {


        /**
         * Returns whether the command is supported
         *
         * @param {string} command
         *
         * @return {boolean}
         */
        canExecute: function (command) {    
            for (var i = 0; i < this.controls.length; i++) {
                if (this.controls[i].canExecute(command)) {
                    return true;
                }
            }                       
            return false;
        },

        /**
         * Execute the command
         *
         * @param {string} command
         *
         * @param {[args]} arguments
         *
         * @return {all}
         */
        execCommand: function (command) {
            var slice = Array.prototype.slice;
            var args = slice.apply(arguments);
            for (var i = 0; i < this.controls.length; i++) {
                if (this.controls[i].canExecute(command)) {                    
                    return this.controls[i].execCommand.apply(this.controls[i], args);
                }
            }          
            console.error('CaCommand[' + command + '] is not supported.');            
        }
    });

    /**
         * CA extensions info getter
         *
         * @return {object}
         */
    ContentAssistController.getCaExtensionInfos = function () {
        return caExtensionInfos;
    };

    return ContentAssistController;
});