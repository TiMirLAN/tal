/**
 * @fileOverview Requirejs module containing the antie.devices.broadcastsource.samsungtvsource class.
 *
 * @preserve Copyright (c) 2013 British Broadcasting Corporation
 * (http://www.bbc.co.uk) and TAL Contributors (1)
 *
 * (1) TAL Contributors are listed in the AUTHORS file and at
 *     https://github.com/fmtvp/TAL/AUTHORS - please extend this file,
 *     not this notice.
 *
 * @license Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * All rights reserved
 * Please contact us for an alternative licence
 */

require.def('antie/devices/broadcastsource/samsungtvsource',
    [
        'antie/devices/browserdevice',
        'antie/devices/broadcastsource/basetvsource',
        'antie/application',
        'antie/devices/broadcastsource/channel'
    ],
    function (Device, BaseTvSource, Application, Channel) {
        /**
         * Contains a Samsung Maple implementation of the antie broadcast TV source.
         * @see http://www.samsungdforum.com/Guide/ref00014/PL_WINDOW_SOURCE.html
         */
        var PL_WINDOW_SOURCE_TV = 0; // The TV source
        var PL_WINDOW_SOURCE_MEDIA = 43; // The media source

        var DOM_ELEMENT_ID = "pluginObjectWindow";
        var SamsungSource = BaseTvSource.extend(/** @lends antie.devices.broadcastsource.SamsungSource.prototype */ {
            /**
             * @constructor
             * @ignore
             */
            init: function () {
                this._samsungSefWindowPlugin = document.getElementById(DOM_ELEMENT_ID);

                if (!this._samsungSefWindowPlugin) {
                    throw new Error('Unable to initialise Samsung broadcast source');
                }

                this._setBroadcastToFullScreen();
            },
            /**
             * Sets the current source to TV broadcast
             * @see http://www.samsungdforum.com/Guide/ref00014/SetSource.html
             */
            showCurrentChannel: function () {
                this._samsungSefWindowPlugin.SetSource(PL_WINDOW_SOURCE_TV);
            },
            /**
             * Sets the current source to the media source
             * @see http://www.samsungdforum.com/Guide/ref00014/SetSource.html
             */
            stopCurrentChannel: function() {
                this._samsungSefWindowPlugin.SetSource(PL_WINDOW_SOURCE_MEDIA);
            },
            /**
             * Gets the service name of the current channel
             * @see http://www.samsungdforum.com/Guide/ref00014/getcurrentchannel_servicename.html
             */
            getCurrentChannelName: function () {
                var channelName = this._samsungSefWindowPlugin.GetCurrentChannel_Name();
                if (channelName < 0) {
                    throw new Error('Channel name returned error code: ' + channelName);
                }
                return channelName;
            },
            getCurrentChannel : function() {
                try {

                    var mapleChannel = webapis.tv.channel.getCurrentChannel();

                    return this._createChannelFromMapleChannel(mapleChannel);

                } catch (e) {
                    return false;
                }
            },
            getChannelList: function (params) {

                var self = this;

                var createChannelList = function(mapleChannels) {
                    var result = [];
                    for (var i = 0; i < mapleChannels.length; i++) {
                        result.push(self._createChannelFromMapleChannel(mapleChannels[i]));
                    }
                    params.onSuccess(result);
                };

                try {

                    var onFailedToRetrieveChannelList = function () {
                        params.onError({
                            name : "ChannelListError",
                            message : "Channel list is not available"
                        });
                    };

                    webapis.tv.channel.getChannelList(createChannelList, onFailedToRetrieveChannelList, webapis.tv.channel.NAVIGATOR_MODE_ALL, 0, 1000000);
                } catch (error) {

                    params.onError({
                        name : "ChannelListError",
                        message : "Channel list is empty or not available"
                    });
                }
            },
            /**
             * Sets the size and position of the visible broadcast source
             * @param top
             * @param left
             * @param width
             * @param height
             */
            setPosition : function(top, left, width, height) {
                this._samsungSefWindowPlugin.SetScreenRect(left, top, width, height);
            },
            /**
             * Reverts the current screen settings and performs any clean up required before
             * the user exits the application back to standard broadcast.
             * @see http://www.samsungdforum.com/Guide/tec00103/index.html
             */
            destroy : function() {
                this.setPosition(0, -1, 0, 0);
            },
            setChannel : function(params) {
                this._tuneChannelByTriplet(params);
            },
            setChannelByName : function(params) {
                var currentChannel = this.getCurrentChannel();
                if (!currentChannel) {
                    params.onError("Unable to determine current channel");

                } else if (currentChannel.name === params.channelName) {
                    this.showCurrentChannel();
                    params.onSuccess();

                } else {

                    this._tuneToChannelMatchingSpec({
                            spec: { name: params.channelName },
                            onError: params.onError,
                            onSuccess: params.onSuccess
                        }
                    );
                }
            },
            _setBroadcastToFullScreen : function() {
                var currentLayout = Application.getCurrentApplication().getLayout().requiredScreenSize;
                this.setPosition(0, 0, currentLayout.width, currentLayout.height);
            },
            /**
             * @see http://img-developer.samsung.com/onlinedocs/samsung_webapi_guide/html/index.html
             */
            _tuneChannelByTriplet : function(params) {

                this._tuneToChannelMatchingSpec({
                    spec: {
                        // FIXME: ONID is always reported as 65535, so exclude from check
                        tsid: params.tsid,
                        sid: params.sid
                        },
                    onError: params.onError,
                    onSuccess: params.onSuccess
                });

            },
            _tuneToChannelMatchingSpec : function (params) {

                var self = this;

                var onChannelListRetrieved = function (channels) {

                    var channel = undefined;

                    channelLoop: for (var i = 0; i < channels.length; i++) {

                        specLoop: for (var prop in params.spec) {
                            if (!params.spec.hasOwnProperty(prop)) {
                                // Don't match on inherited properties
                                continue specLoop;
                            }
                            if (channels[i][prop] !== params.spec[prop]) {
                                // Spec not matched
                                continue channelLoop;
                            }
                        }
                        // All spec's own properties found and match.
                        channel = channels[i];
                        break channelLoop;
                    }

                    if (channel) {
                        self._tuneToChannel({
                            channel: channel,
                            onError: params.onError,
                            onSuccess: params.onSuccess
                        });

                    } else {
                        params.onError({
                            name : "ChannelError",
                            message : "Channel could not be found"
                        });
                    }
                };

                this.getChannelList({
                    onError: params.onError,
                    onSuccess: onChannelListRetrieved
                });
            },
            /**
             * @param params.channel Channel object
             * @param params.onError Function to call with a string message on error.
             * @param params.onSuccess Function to call on success.
             * @private
             */
            _tuneToChannel: function(params) {

                var channel = params.channel;

                var newChannelArgs = {
                    sourceID: channel.sourceId,
                    programNumber: channel.sid,
                    transportStreamID: channel.tsid,
                    originalNetworkID: channel.onid,
                    ptc: channel.ptc,
                    major: channel.major,
                    minor: channel.minor
                };

                try {
                    var tuneError = function () {
                        params.onError({
                            name : "ChangeChannelError",
                            message : "Error tuning channel"
                        });
                    };

                    webapis.tv.channel.tune(newChannelArgs, params.onSuccess, tuneError, 0);

                } catch (e) {
                    params.onError({
                        name : "ChangeChannelError",
                        message : "Error tuning channel"
                    });
                }

            },
            _createChannelFromMapleChannel: function (mapleChannel) {
                return new Channel({
                    name: mapleChannel.channelName,
                    onid: mapleChannel.originalNetworkID,
                    tsid: mapleChannel.transportStreamID,
                    sid: mapleChannel.programNumber,
                    channelType: undefined,
                    ptc: mapleChannel.ptc,
                    major: mapleChannel.major,
                    minor: mapleChannel.minor,
                    sourceId: mapleChannel.sourceID
                });
            }
        });

        /**
         * Create a new widget giving control over broadcast television. Check whether
         * the broadcast television API is available first with isBroadcastSourceSupported().
         * @see antie.widgets.broadcastsource
         * @returns {Object} Device-specific implementation of antie.widgets.broadcastsource
         */
        Device.prototype.createBroadcastSource = function() {
            if (!this._broadcastSource) {
                this._broadcastSource = new SamsungSource();
            }

            return this._broadcastSource;
        };

        // Return for testing purposes only
        return SamsungSource;
    }
);