(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

(function(root) {
  var Twilio = root.Twilio || function Twilio() { };

  Object.assign(Twilio, require('./twilio'));

  root.Twilio = Twilio;
})(typeof window !== 'undefined' ? window : global);

},{"./twilio":2}],2:[function(require,module,exports){
'use strict';

exports.Device = require('./twilio/device').Device;
exports.PStream = require('./twilio/pstream').PStream;
exports.Connection = require('./twilio/connection').Connection;

},{"./twilio/connection":4,"./twilio/device":5,"./twilio/pstream":11}],3:[function(require,module,exports){
'use strict';

var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var log = require('./log');
var MediaDeviceInfoShim = require('./shims/mediadeviceinfo');
var defaultMediaDevices = require('./shims/mediadevices');
var OutputDeviceCollection = require('./outputdevicecollection');
var util = require('./util');

/**
 * @class
 * @property {Map<string deviceId, MediaDeviceInfo device>} availableInputDevices - A
 *   Map of all audio input devices currently available to the browser.
 * @property {Map<string deviceId, MediaDeviceInfo device>} availableOutputDevices - A
 *   Map of all audio output devices currently available to the browser.
 * @property {MediaDeviceInfo} inputDevice - The active input device. This will not
 *   initially be populated. Having no inputDevice specified by setInputDevice()
 *   will disable input selection related functionality.
 * @property {boolean} isOutputSelectionSupported - False if the browser does not support
 *   setSinkId or enumerateDevices and Twilio can not facilitate output selection
 *   functionality.
 * @property {boolean} isVolumeSupported - False if the browser does not support
 *   AudioContext and Twilio can not analyse the volume in real-time.
 * @property {OutputDeviceCollection} speakerDevices - The current set of output
 *   devices that call audio ([voice, outgoing, disconnect, dtmf]) is routed through.
 *   These are the sounds that are initiated by the user, or played while the user
 *   is otherwise present at the endpoint. If all specified devices are lost,
 *   this Set will revert to contain only the "default" device.
 * @property {OutputDeviceCollection} ringtoneDevices - The current set of output
 *   devices that incoming ringtone audio is routed through. These are the sounds that
 *   may play while the user is away from the machine or not wearing their
 *   headset. It is important that this audio is heard. If all specified
 *   devices lost, this Set will revert to contain only the "default" device.
 * @fires AudioHelper#deviceChange
 */
function AudioHelper(onActiveOutputsChanged, onActiveInputChanged, getUserMedia, options) {
  if (!(this instanceof AudioHelper)) {
    return new AudioHelper(onActiveOutputsChanged, onActiveInputChanged, getUserMedia, options);
  }

  EventEmitter.call(this);

  options = Object.assign({
    AudioContext: typeof AudioContext !== 'undefined' && AudioContext,
    mediaDevices: defaultMediaDevices,
    setSinkId: typeof HTMLAudioElement !== 'undefined' && HTMLAudioElement.prototype.setSinkId
  }, options);

  log.mixinLog(this, '[AudioHelper]');
  this.log.enabled = options.logEnabled;
  this.log.warnings = options.logWarnings;

  var availableInputDevices = new Map();
  var availableOutputDevices = new Map();

  var isAudioContextSupported = !!(options.AudioContext || options.audioContext);

  var mediaDevices = options.mediaDevices;
  var isEnumerationSupported = mediaDevices && mediaDevices.enumerateDevices || false;
  var isSetSinkSupported = typeof options.setSinkId === 'function';
  var isOutputSelectionSupported = isEnumerationSupported && isSetSinkSupported;
  var isVolumeSupported = isAudioContextSupported;

  if (options.soundOptions) {
    addOptionsToAudioHelper(this, options.soundOptions);
  }

  var audioContext = null;
  var inputVolumeAnalyser = null;
  if (isVolumeSupported) {
    audioContext = options.audioContext || new options.AudioContext();
    inputVolumeAnalyser = audioContext.createAnalyser();
    inputVolumeAnalyser.fftSize = 32;
    inputVolumeAnalyser.smoothingTimeConstant = 0.3;
  }

  var self = this;
  Object.defineProperties(this, {
    _audioContext: {
      value: audioContext
    },
    _getUserMedia: {
      value: getUserMedia
    },
    _inputDevice: {
      value: null,
      writable: true
    },
    _inputStream: {
      value: null,
      writable: true
    },
    _inputVolumeAnalyser: {
      value: inputVolumeAnalyser
    },
    _isPollingInputVolume: {
      value: false,
      writable: true
    },
    _onActiveInputChanged: {
      value: onActiveInputChanged
    },
    _mediaDevices: {
      value: mediaDevices
    },
    _unknownDeviceIndexes: {
      value: { }
    },
    _updateAvailableDevices: {
      value: updateAvailableDevices.bind(null, this)
    },
    availableInputDevices: {
      enumerable: true,
      value: availableInputDevices
    },
    availableOutputDevices: {
      enumerable: true,
      value: availableOutputDevices
    },
    inputDevice: {
      enumerable: true,
      get: function() {
        return self._inputDevice;
      }
    },
    inputStream: {
      enumerable: true,
      get: function() {
        return self._inputStream;
      }
    },
    isVolumeSupported: {
      enumerable: true,
      value: isVolumeSupported
    },
    isOutputSelectionSupported: {
      enumerable: true,
      value: isOutputSelectionSupported
    },
    ringtoneDevices: {
      enumerable: true,
      value: new OutputDeviceCollection(
        'ringtone', availableOutputDevices, onActiveOutputsChanged, isOutputSelectionSupported)
    },
    speakerDevices: {
      enumerable: true,
      value: new OutputDeviceCollection(
        'speaker', availableOutputDevices, onActiveOutputsChanged, isOutputSelectionSupported)
    }
  });

  this.on('newListener', function(eventName) {
    if (eventName === 'inputVolume') {
      self._maybeStartPollingVolume();
    }
  });

  this.on('removeListener', function(eventName) {
    if (eventName === 'inputVolume') {
      self._maybeStopPollingVolume();
    }
  });

  this.once('newListener', function() {
    // NOTE (rrowland): Ideally we would only check isEnumerationSupported here, but
    //   in at least one browser version (Tested in FF48) enumerateDevices actually
    //   returns bad data for the listed devices. Instead, we check for
    //   isOutputSelectionSupported to avoid these quirks that may negatively affect customers.
    if (!isOutputSelectionSupported) {
      // eslint-disable-next-line no-console
      console.warn('Warning: This browser does not support audio output selection.');
    }

    if (!isVolumeSupported) {
      // eslint-disable-next-line no-console
      console.warn('Warning: This browser does not support Twilio\'s volume indicator feature.');
    }
  });

  if (isEnumerationSupported) {
    initializeEnumeration(this);
  }
}

function initializeEnumeration(audio) {
  audio._mediaDevices.addEventListener('devicechange', audio._updateAvailableDevices);
  audio._mediaDevices.addEventListener('deviceinfochange', audio._updateAvailableDevices);

  updateAvailableDevices(audio).then(function() {
    if (!audio.isOutputSelectionSupported) { return; }

    Promise.all([
      audio.speakerDevices.set('default'),
      audio.ringtoneDevices.set('default')
    ]).catch(function(reason) {
      audio.log.warn('Warning: Unable to set audio output devices. ' + reason);
    });
  });
}

inherits(AudioHelper, EventEmitter);

AudioHelper.prototype._maybeStartPollingVolume = function _maybeStartPollingVolume() {
  if (!this.isVolumeSupported || !this._inputStream) { return; }

  updateVolumeSource(this);

  if (this._isPollingInputVolume) { return; }

  var bufferLength = this._inputVolumeAnalyser.frequencyBinCount;
  var buffer = new Uint8Array(bufferLength);

  var self = this;
  this._isPollingInputVolume = true;
  requestAnimationFrame(function emitVolume() {
    if (!self._isPollingInputVolume) { return; }

    self._inputVolumeAnalyser.getByteFrequencyData(buffer);
    var inputVolume = util.average(buffer);

    self.emit('inputVolume', inputVolume / 255);
    requestAnimationFrame(emitVolume);
  });
};

AudioHelper.prototype._maybeStopPollingVolume = function _maybeStopPollingVolume() {
  if (!this.isVolumeSupported) { return; }

  if (!this._isPollingInputVolume || (this._inputStream && this.listenerCount('inputVolume'))) {
    return;
  }

  if (this._inputVolumeSource) {
    this._inputVolumeSource.disconnect();
    this._inputVolumeSource = null;
  }

  this._isPollingInputVolume = false;
};

/**
 * Replace the current input device with a new device by ID.
 * @param {string} deviceId - An ID of a device to replace the existing
 *   input device with.
 * @returns {Promise} - Rejects if the ID is not found, setting the input device
 *   fails, or an ID is not passed.
 */
AudioHelper.prototype.setInputDevice = function setInputDevice(deviceId) {
  if (util.isFirefox()) {
    return Promise.reject(new Error('Firefox does not currently support opening multiple ' +
      'audio input tracks simultaneously, even across different tabs. As a result, ' +
      'Device.audio.setInputDevice is disabled on Firefox until support is added.\n' +
      'Related BugZilla thread: https://bugzilla.mozilla.org/show_bug.cgi?id=1299324'));
  }

  return this._setInputDevice(deviceId, false);
};

/**
 * Replace the current input device with a new device by ID.
 * @private
 * @param {string} deviceId - An ID of a device to replace the existing
 *   input device with.
 * @param {boolean} forceGetUserMedia - If true, getUserMedia will be called even if
 *   the specified device is already active.
 * @returns {Promise} - Rejects if the ID is not found, setting the input device
 *   fails, or an ID is not passed.
 */
AudioHelper.prototype._setInputDevice = function _setInputDevice(deviceId, forceGetUserMedia) {
  if (typeof deviceId !== 'string') {
    return Promise.reject(new Error('Must specify the device to set'));
  }

  var device = this.availableInputDevices.get(deviceId);
  if (!device) {
    return Promise.reject(new Error('Device not found: ' + deviceId));
  }

  if (this._inputDevice && this._inputDevice.deviceId === deviceId && this._inputStream) {
    if (!forceGetUserMedia) {
      return Promise.resolve();
    }

    // If the currently active track is still in readyState `live`, gUM may return the same track
    // rather than returning a fresh track.
    this._inputStream.getTracks().forEach(function(track) {
      track.stop();
    });
  }

  var self = this;
  return this._getUserMedia({
    audio: { deviceId: { exact: deviceId } }
  }).then(function onGetUserMediaSuccess(stream) {
    return self._onActiveInputChanged(stream).then(function() {
      replaceStream(self, stream);
      self._inputDevice = device;
      self._maybeStartPollingVolume();
    });
  });
};

/**
 * Unset the input device, stopping the tracks. This should only be called when not in a connection, and
 *   will not allow removal of the input device during a live call.
 * @returns {Promise} Rejects if the input device is currently in use by a connection.
 */
AudioHelper.prototype.unsetInputDevice = function unsetInputDevice() {
  if (!this.inputDevice) { return Promise.resolve(); }

  var self = this;
  return this._onActiveInputChanged(null).then(function() {
    replaceStream(self, null);
    self._inputDevice = null;
    self._maybeStopPollingVolume();
  });
};

/**
 * Unbind the listeners from mediaDevices.
 * @private
 */
AudioHelper.prototype._unbind = function _unbind() {
  this._mediaDevices.removeEventListener('devicechange', this._updateAvailableDevices);
  this._mediaDevices.removeEventListener('deviceinfochange', this._updateAvailableDevices);
};

/**
 * @event AudioHelper#deviceChange
 * Fired when the list of available devices has changed.
 * @param {Array<MediaDeviceInfo>} lostActiveDevices - An array of all currently-active
 *   devices that were removed with this device change. An empty array if the current
 *   active devices remain unchanged. A non-empty array is an indicator that the user
 *   experience has likely been impacted.
 */

/**
 * Merge the passed Options into AudioHelper. Currently used to merge the deprecated
 *   <Options>Device.sounds object onto the new AudioHelper interface.
 * @param {AudioHelper} audioHelper - The AudioHelper instance to merge the Options
 *   onto.
 * @param {Options} options - The Twilio Options object to merge.
 * @private
 */
function addOptionsToAudioHelper(audioHelper, options) {
  var dictionary = options.__dict__;
  if (!dictionary) { return; }

  function setValue(key, value) {
    if (typeof value !== 'undefined') {
      dictionary[key] = value;
    }

    return dictionary[key];
  }

  Object.keys(dictionary).forEach(function(key) {
    audioHelper[key] = setValue.bind(null, key);
  });
}

/**
 * Update the available input and output devices
 * @param {AudioHelper} audio
 * @returns {Promise}
 * @private
 */
function updateAvailableDevices(audio) {
  return audio._mediaDevices.enumerateDevices().then(function(devices) {
    updateDevices(audio,
      filterByKind(devices, 'audiooutput'),
      audio.availableOutputDevices,
      removeLostOutput);

    updateDevices(audio,
      filterByKind(devices, 'audioinput'),
      audio.availableInputDevices,
      removeLostInput);

    var defaultDevice = audio.availableOutputDevices.get('default')
      || Array.from(audio.availableOutputDevices.values())[0];

    [audio.speakerDevices, audio.ringtoneDevices].forEach(function(outputDevices) {
      if (!outputDevices.get().size && audio.availableOutputDevices.size) {
        outputDevices.set(defaultDevice.deviceId);
      }
    });
  });
}

/**
 * Remove an input device from outputs
 * @param {AudioHelper} audio
 * @param {MediaDeviceInfoShim} lostDevice
 * @returns {boolean} wasActive
 * @private
 */
function removeLostOutput(audio, lostDevice) {
  return audio.speakerDevices._delete(lostDevice) |
    audio.ringtoneDevices._delete(lostDevice);
}

/**
 * Remove an input device from inputs
 * @param {AudioHelper} audio
 * @param {MediaDeviceInfoShim} lostDevice
 * @returns {boolean} wasActive
 * @private
 */
function removeLostInput(audio, lostDevice) {
  if (!audio.inputDevice || audio.inputDevice.deviceId !== lostDevice.deviceId) {
    return false;
  }

  replaceStream(audio, null);
  audio._inputDevice = null;
  audio._maybeStopPollingVolume();

  var defaultDevice = audio.availableInputDevices.get('default')
    || Array.from(audio.availableInputDevices.values())[0];

  if (defaultDevice) {
    audio.setInputDevice(defaultDevice.deviceId);
  }

  return true;
}

function filterByKind(devices, kind) {
  return devices.filter(function(device) { return device.kind === kind; });
}

function getDeviceId(device) {
  return device.deviceId;
}

function updateDevices(audio, updatedDevices, availableDevices, removeLostDevice) {
  var updatedDeviceIds = updatedDevices.map(getDeviceId);
  var knownDeviceIds = Array.from(availableDevices.values()).map(getDeviceId);
  var lostActiveDevices = [];

  // Remove lost devices
  var lostDeviceIds = util.difference(knownDeviceIds, updatedDeviceIds);
  lostDeviceIds.forEach(function(lostDeviceId) {
    var lostDevice = availableDevices.get(lostDeviceId);
    availableDevices.delete(lostDeviceId);
    if (removeLostDevice(audio, lostDevice)) { lostActiveDevices.push(lostDevice); }
  });

  // Add any new devices, or devices with updated labels
  var deviceChanged = false;
  updatedDevices.forEach(function(newDevice) {
    var existingDevice = availableDevices.get(newDevice.deviceId);
    var newMediaDeviceInfo = wrapMediaDeviceInfo(audio, newDevice);

    if (!existingDevice || existingDevice.label !== newMediaDeviceInfo.label) {
      availableDevices.set(newDevice.deviceId, newMediaDeviceInfo);
      deviceChanged = true;
    }
  });

  if (deviceChanged || lostDeviceIds.length) {
    // Force a new gUM in case the underlying tracks of the active stream have changed. One
    //   reason this might happen is when `default` is selected and set to a USB device,
    //   then that device is unplugged or plugged back in. We can't check for the 'ended'
    //   event or readyState because it is asynchronous and may take upwards of 5 seconds,
    //   in my testing. (rrowland)
    if (audio.inputDevice !== null && audio.inputDevice.deviceId === 'default') {
      audio.log.warn(['Calling getUserMedia after device change to ensure that the',
        'tracks of the active device (default) have not gone stale.'].join(' '));
      audio._setInputDevice(audio._inputDevice.deviceId, true);
    }

    audio.emit('deviceChange', lostActiveDevices);
  }
}

var kindAliases = {
  audiooutput: 'Audio Output',
  audioinput: 'Audio Input'
};

function getUnknownDeviceIndex(audioHelper, mediaDeviceInfo) {
  var id = mediaDeviceInfo.deviceId;
  var kind = mediaDeviceInfo.kind;
  var unknownIndexes = audioHelper._unknownDeviceIndexes;

  if (!unknownIndexes[kind]) {
    unknownIndexes[kind] = { };
  }

  var index = unknownIndexes[kind][id];
  if (!index) {
    index = Object.keys(unknownIndexes[kind]).length + 1;
    unknownIndexes[kind][id] = index;
  }

  return index;
}

function wrapMediaDeviceInfo(audioHelper, mediaDeviceInfo) {
  var options = {
    deviceId: mediaDeviceInfo.deviceId,
    groupId: mediaDeviceInfo.groupId,
    kind: mediaDeviceInfo.kind,
    label: mediaDeviceInfo.label
  };

  if (!options.label) {
    if (options.deviceId === 'default') {
      options.label = 'Default';
    } else {
      var index = getUnknownDeviceIndex(audioHelper, mediaDeviceInfo);
      options.label = 'Unknown ' + kindAliases[options.kind] + ' Device ' + index;
    }
  }

  return new MediaDeviceInfoShim(options);
}


function updateVolumeSource(audioHelper) {
  if (audioHelper._inputVolumeSource) {
    audioHelper._inputVolumeSource.disconnect();
    audioHelper._inputVolumeSource = null;
  }

  audioHelper._inputVolumeSource = audioHelper._audioContext.createMediaStreamSource(audioHelper._inputStream);
  audioHelper._inputVolumeSource.connect(audioHelper._inputVolumeAnalyser);
}

function replaceStream(audio, stream) {
  if (audio._inputStream) {
    audio._inputStream.getTracks().forEach(function(track) {
      track.stop();
    });
  }

  audio._inputStream = stream;
}

module.exports = AudioHelper;

},{"./log":8,"./outputdevicecollection":10,"./shims/mediadeviceinfo":22,"./shims/mediadevices":23,"./util":27,"events":34,"util":49}],4:[function(require,module,exports){
'use strict';

var EventEmitter = require('events').EventEmitter;
var Exception = require('./util').Exception;
var log = require('./log');
var rtc = require('./rtc');
var RTCMonitor = require('./rtc/monitor');
var twutil = require('./util');
var util = require('util');

var DTMF_INTER_TONE_GAP = 70;
var DTMF_PAUSE_DURATION = 500;
var DTMF_TONE_DURATION = 160;

var METRICS_BATCH_SIZE = 10;
var SAMPLES_TO_IGNORE = 20;

var FEEDBACK_SCORES = [1, 2, 3, 4, 5];
var FEEDBACK_ISSUES = [
  'one-way-audio',
  'choppy-audio',
  'dropped-call',
  'audio-latency',
  'noisy-call',
  'echo'
];

var WARNING_NAMES = {
  audioOutputLevel: 'audio-output-level',
  audioInputLevel: 'audio-input-level',
  packetsLostFraction: 'packet-loss',
  jitter: 'jitter',
  rtt: 'rtt',
  mos: 'mos'
};

var WARNING_PREFIXES = {
  min: 'low-',
  max: 'high-',
  maxDuration: 'constant-'
};

/**
 * Constructor for Connections.
 *
 * @exports Connection as Twilio.Connection
 * @memberOf Twilio
 * @borrows EventEmitter#addListener as #addListener
 * @borrows EventEmitter#emit as #emit
 * @borrows EventEmitter#removeListener as #removeListener
 * @borrows EventEmitter#hasListener as #hasListener
 * @borrows Twilio.mixinLog-log as #log
 * @constructor
 * @param {object} device The device associated with this connection
 * @param {object} message Data to send over the connection
 * @param {Connection.Options} [options]
 *//**
 * @typedef {Object} Connection.Options
 * @property {string} [chunder='chunder.prod.twilio.com'] Hostname of chunder server
 * @property {boolean} [debug=false] Enable debugging
 * @property {boolean} [encrypt=false] Encrypt media
 * @property {MediaStream} [MediaStream] Use this MediaStream object
 * @property {string} [token] The Twilio capabilities JWT
 * @property {function<MediaStream>} [getInputStream] A function returning an input stream to use when
 *   setting up the PeerConnection object when Connection#accept is called.
 * @property {function<Array<string>>} [getSinkIds] A function returning an array of sink IDs to use when
 *   setting up the PeerConnection object when Connection#accept is called.
 * @property {string} [callParameters] The call parameters, if this is an incoming
 *   connection.
 */
function Connection(device, message, getUserMedia, options) {
  if (!(this instanceof Connection)) {
    return new Connection(device, message, getUserMedia, options);
  }

  var self = this;

  twutil.monitorEventEmitter('Twilio.Connection', this);
  this._soundcache = device.soundcache;
  this.message = message || {};

  // (rrowland) Lint: This constructor should not be lower case, but if we don't support
  //   the prior name we may break something.
  var DefaultMediaStream = options.mediaStreamFactory
    || device.options.MediaStream
    || device.options.mediaStreamFactory
    || rtc.PeerConnection;

  options = this.options = Object.assign({
    audioConstraints: device.options.audioConstraints,
    callParameters: { },
    debug: false,
    encrypt: false,
    iceServers: device.options.iceServers,
    logPrefix: '[Connection]',
    MediaStream: DefaultMediaStream,
    offerSdp: null,
    rtcConstraints: device.options.rtcConstraints
  }, options);

  this.parameters = options.callParameters;
  this._status = 'pending';
  this._isAnswered = false;
  this._direction = this.parameters.CallSid ? 'INCOMING' : 'OUTGOING';

  this.sendHangup = true;
  log.mixinLog(this, this.options.logPrefix);
  this.log.enabled = this.options.debug;
  this.log.warnings = this.options.warnings;

  // These are event listeners we need to remove from PStream.
  function noop() {}
  this._onCancel = noop;
  this._onHangup = noop;

  var publisher = this._publisher = options.publisher;

  if (this._direction === 'INCOMING') {
    publisher.info('connection', 'incoming', null, this);
  }

  var monitor = this._monitor = new RTCMonitor();

  // First 10 seconds or so are choppy, so let's not bother with these warnings.
  monitor.disableWarnings();

  var samples = [];

  function createMetricPayload() {
    var payload = {
      /* eslint-disable camelcase */
      call_sid: self.parameters.CallSid,
      client_name: device._clientName,
      sdk_version: twutil.getReleaseVersion(),
      selected_region: device.options.region
      /* eslint-enable camelcase */
    };

    if (device.stream) {
      if (device.stream.gateway) {
        payload.gateway = device.stream.gateway;
      }

      if (device.stream.region) {
        payload.region = device.stream.region;
      }
    }

    payload.direction = self._direction;

    return payload;
  }

  function publishMetrics() {
    if (samples.length === 0) {
      return;
    }

    publisher.postMetrics(
      'quality-metrics-samples', 'metrics-sample', samples.splice(0), createMetricPayload()
    );
  }

  var samplesIgnored = 0;
  monitor.on('sample', function(sample) {
    // Enable warnings after we've ignored the an initial amount. This is to
    // avoid throwing false positive warnings initially.
    if (samplesIgnored < SAMPLES_TO_IGNORE) {
      samplesIgnored++;
    } else if (samplesIgnored === SAMPLES_TO_IGNORE) {
      monitor.enableWarnings();
    }

    sample.inputVolume = self._latestInputVolume;
    sample.outputVolume = self._latestOutputVolume;

    samples.push(sample);
    if (samples.length >= METRICS_BATCH_SIZE) {
      publishMetrics();
    }
  });

  function formatPayloadForEA(warningData) {
    var payloadData = { threshold: warningData.threshold.value };

    if (warningData.values) {
      payloadData.values = warningData.values.map(function(value) {
        if (typeof value === 'number') {
          return Math.round(value * 100) / 100;
        }

        return value;
      });
    } else if (warningData.value) {
      payloadData.value = warningData.value;
    }

    return { data: payloadData };
  }

  function reemitWarning(wasCleared, warningData) {
    var groupPrefix = /^audio/.test(warningData.name) ?
      'audio-level-' : 'network-quality-';
    var groupSuffix = wasCleared ? '-cleared' : '-raised';
    var groupName = groupPrefix + 'warning' + groupSuffix;

    var warningPrefix = WARNING_PREFIXES[warningData.threshold.name];
    var warningName = warningPrefix + WARNING_NAMES[warningData.name];

    // Ignore constant input if the Connection is muted (Expected)
    if (warningName === 'constant-audio-input-level' && self.isMuted()) {
      return;
    }

    var level = wasCleared ? 'info' : 'warning';

    // Avoid throwing false positives as warnings until we refactor volume metrics
    if (warningName === 'constant-audio-output-level') {
      level = 'info';
    }

    publisher.post(level, groupName, warningName, formatPayloadForEA(warningData), self);

    if (warningName !== 'constant-audio-output-level') {
      var emitName = wasCleared ? 'warning-cleared' : 'warning';
      self.emit(emitName, warningName);
    }
  }

  monitor.on('warning-cleared', reemitWarning.bind(null, true));
  monitor.on('warning', reemitWarning.bind(null, false));

  /**
   * Reference to the Twilio.MediaStream object.
   * @type Twilio.MediaStream
   */
  this.mediaStream = new this.options.MediaStream(device, getUserMedia);

  this.on('volume', function(inputVolume, outputVolume) {
    self._latestInputVolume = inputVolume;
    self._latestOutputVolume = outputVolume;
  });

  this.mediaStream.onvolume = this.emit.bind(this, 'volume');

  this.mediaStream.oniceconnectionstatechange = function(state) {
    var level = state === 'failed' ? 'error' : 'debug';
    publisher.post(level, 'ice-connection-state', state, null, self);
  };

  this.mediaStream.onicegatheringstatechange = function(state) {
    publisher.debug('signaling-state', state, null, self);
  };

  this.mediaStream.onsignalingstatechange = function(state) {
    publisher.debug('signaling-state', state, null, self);
  };

  this.mediaStream.ondisconnect = function(msg) {
    self.log(msg);
    publisher.warn('network-quality-warning-raised', 'ice-connectivity-lost', {
      message: msg
    }, self);
    self.emit('warning', 'ice-connectivity-lost');
  };
  this.mediaStream.onreconnect = function(msg) {
    self.log(msg);
    publisher.info('network-quality-warning-cleared', 'ice-connectivity-lost', {
      message: msg
    }, self);
    self.emit('warning-cleared', 'ice-connectivity-lost');
  };
  this.mediaStream.onerror = function(e) {
    if (e.disconnect === true) {
      self._disconnect(e.info && e.info.message);
    }
    var error = {
      code: e.info.code,
      message: e.info.message || 'Error with mediastream',
      info: e.info,
      connection: self
    };

    self.log('Received an error from MediaStream:', e);
    self.emit('error', error);
  };

  this.mediaStream.onopen = function() {
    // NOTE(mroberts): While this may have been happening in previous
    // versions of Chrome, since Chrome 45 we have seen the
    // PeerConnection's onsignalingstatechange handler invoked multiple
    // times in the same signalingState 'stable'. When this happens, we
    // invoke this onopen function. If we invoke it twice without checking
    // for _status 'open', we'd accidentally close the PeerConnection.
    //
    // See <https://code.google.com/p/webrtc/issues/detail?id=4996>.
    if (self._status === 'open') {
      return;
    } else if (self._status === 'ringing' || self._status === 'connecting') {
      self.mute(false);
      self._maybeTransitionToOpen();
    } else {
      // call was probably canceled sometime before this
      self.mediaStream.close();
    }
  };

  this.mediaStream.onclose = function() {
    self._status = 'closed';
    if (device.sounds.__dict__.disconnect) {
      device.soundcache.get('disconnect').play();
    }

    monitor.disable();
    publishMetrics();

    self.emit('disconnect', self);
  };

  // temporary call sid to be used for outgoing calls
  this.outboundConnectionId = twutil.generateConnectionUUID();

  this.pstream = device.stream;

  this._onCancel = function(payload) {
    var callsid = payload.callsid;
    if (self.parameters.CallSid === callsid) {
      self._status = 'closed';
      self.emit('cancel');
      self.pstream.removeListener('cancel', self._onCancel);
    }
  };

  // NOTE(mroberts): The test '#sendDigits throws error' sets this to `null`.
  if (this.pstream) {
    this.pstream.on('cancel', this._onCancel);
    this.pstream.on('ringing', this._onRinging.bind(this));
  }

  this.on('error', function(error) {
    publisher.error('connection', 'error', {
      code: error.code, message: error.message
    }, self);

    if (self.pstream && self.pstream.status === 'disconnected') {
      cleanupEventListeners(self);
    }
  });

  this.on('disconnect', function() {
    cleanupEventListeners(self);
  });

  return this;
}

util.inherits(Connection, EventEmitter);

/**
 * @return {string}
 */
Connection.toString = function() {
  return '[Twilio.Connection class]';
};

/**
 * @return {string}
 */
Connection.prototype.toString = function() {
  return '[Twilio.Connection instance]';
};
Connection.prototype.sendDigits = function(digits) {
  if (digits.match(/[^0-9*#w]/)) {
    throw new Exception(
      'Illegal character passed into sendDigits');
  }

  var sequence = [];
  digits.split('').forEach(function(digit) {
    var dtmf = (digit !== 'w') ? 'dtmf' + digit : '';
    if (dtmf === 'dtmf*') dtmf = 'dtmfs';
    if (dtmf === 'dtmf#') dtmf = 'dtmfh';
    sequence.push(dtmf);
  });

  (function playNextDigit(soundCache) {
    var digit = sequence.shift();
    soundCache.get(digit).play();
    if (sequence.length) {
      setTimeout(playNextDigit.bind(null, soundCache), 200);
    }
  })(this._soundcache);

  var dtmfSender = this.mediaStream.getOrCreateDTMFSender();

  function insertDTMF(dtmfs) {
    if (!dtmfs.length) { return; }
    var dtmf = dtmfs.shift();

    if (dtmf.length) {
      dtmfSender.insertDTMF(dtmf, DTMF_TONE_DURATION, DTMF_INTER_TONE_GAP);
    }

    setTimeout(insertDTMF.bind(null, dtmfs), DTMF_PAUSE_DURATION);
  }

  if (dtmfSender) {
    if (!('canInsertDTMF' in dtmfSender) || dtmfSender.canInsertDTMF) {
      this.log('Sending digits using RTCDTMFSender');
      // NOTE(mroberts): We can't just map 'w' to ',' since
      // RTCDTMFSender's pause duration is 2 s and Twilio's is more
      // like 500 ms. Instead, we will fudge it with setTimeout.
      insertDTMF(digits.split('w'));
      return;
    }
    this.log('RTCDTMFSender cannot insert DTMF');
  }

  // send pstream message to send DTMF
  this.log('Sending digits over PStream');
  var payload;
  if (this.pstream !== null && this.pstream.status !== 'disconnected') {
    payload = { dtmf: digits, callsid: this.parameters.CallSid };
    this.pstream.publish('dtmf', payload);
  } else {
    payload = { error: {} };
    var error = {
      code: payload.error.code || 31000,
      message: payload.error.message || 'Could not send DTMF: Signaling channel is disconnected',
      connection: this
    };
    this.emit('error', error);
  }
};
Connection.prototype.status = function() {
  return this._status;
};
/**
 * Mute incoming audio.
 */
Connection.prototype.mute = function(shouldMute) {
  if (typeof shouldMute === 'undefined') {
    shouldMute = true;
    this.log.deprecated('.mute() is deprecated. Please use .mute(true) or .mute(false) '
      + 'to mute or unmute a call instead.');
  } else if (typeof shouldMute === 'function') {
    this.addListener('mute', shouldMute);
    return;
  }

  if (this.isMuted() === shouldMute) { return; }
  this.mediaStream.mute(shouldMute);

  var isMuted = this.isMuted();
  this._publisher.info('connection', isMuted ? 'muted' : 'unmuted', null, this);
  this.emit('mute', isMuted, this);
};
/**
 * Check if connection is muted
 */
Connection.prototype.isMuted = function() {
  return this.mediaStream.isMuted;
};
/**
 * Unmute (Deprecated)
 */
Connection.prototype.unmute = function() {
  this.log.deprecated('.unmute() is deprecated. Please use .mute(false) to unmute a call instead.');
  this.mute(false);
};
Connection.prototype.accept = function(handler) {
  if (typeof handler === 'function') {
    this.addListener('accept', handler);
    return;
  }

  if (this._status !== 'pending') {
    return;
  }

  var audioConstraints = handler || this.options.audioConstraints;
  var self = this;
  this._status = 'connecting';

  function connect_() {
    if (self._status !== 'connecting') {
      // call must have been canceled
      cleanupEventListeners(self);
      self.mediaStream.close();
      return;
    }

    var pairs = [];
    for (var key in self.message) {
      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(self.message[key]));
    }

    function onLocalAnswer(pc) {
      self._publisher.info('connection', 'accepted-by-local', null, self);
      self._monitor.enable(pc);
    }

    function onRemoteAnswer(pc) {
      self._publisher.info('connection', 'accepted-by-remote', null, self);
      self._monitor.enable(pc);
    }

    var sinkIds = typeof self.options.getSinkIds === 'function' && self.options.getSinkIds();
    if (Array.isArray(sinkIds)) {
      self.mediaStream._setSinkIds(sinkIds).catch(function() {
        // (rrowland) We don't want this to throw to console since the customer
        // can't control this. This will most commonly be rejected on browsers
        // that don't support setting sink IDs.
      });
    }

    var params = pairs.join('&');
    if (self._direction === 'INCOMING') {
      self._isAnswered = true;
      self.mediaStream.answerIncomingCall(self.parameters.CallSid, self.options.offerSdp,
        self.options.rtcConstraints, self.options.iceServers, onLocalAnswer);
    } else {
      self.pstream.once('answer', self._onAnswer.bind(self));
      self.mediaStream.makeOutgoingCall(self.pstream.token, params, self.outboundConnectionId,
        self.options.rtcConstraints, self.options.iceServers, onRemoteAnswer);
    }

    self._onHangup = function(payload) {
      /**
       *  see if callsid passed in message matches either callsid or outbound id
       *  connection should always have either callsid or outbound id
       *  if no callsid passed hangup anyways
       */
      if (payload.callsid && (self.parameters.CallSid || self.outboundConnectionId)) {
        if (payload.callsid !== self.parameters.CallSid
            && payload.callsid !== self.outboundConnectionId) {
          return;
        }
      } else if (payload.callsid) {
        // hangup is for another connection
        return;
      }

      self.log('Received HANGUP from gateway');
      if (payload.error) {
        var error = {
          code: payload.error.code || 31000,
          message: payload.error.message || 'Error sent from gateway in HANGUP',
          connection: self
        };
        self.log('Received an error from the gateway:', error);
        self.emit('error', error);
      }
      self.sendHangup = false;
      self._publisher.info('connection', 'disconnected-by-remote', null, self);
      self._disconnect(null, true);
      cleanupEventListeners(self);
    };
    self.pstream.addListener('hangup', self._onHangup);
  }

  var inputStream = typeof this.options.getInputStream === 'function' && this.options.getInputStream();
  var promise = inputStream
    ? this.mediaStream.openWithStream(inputStream)
    : this.mediaStream.openWithConstraints(audioConstraints);

  promise.then(function() {
    self._publisher.info('get-user-media', 'succeeded', {
      data: { audioConstraints: audioConstraints }
    }, self);

    connect_();
  }, function(error) {
    var message;
    var code;

    if (error.code && error.code === error.PERMISSION_DENIED
      || error.name && error.name === 'PermissionDeniedError') {
      code = 31208;
      message = 'User denied access to microphone, or the web browser did not allow microphone '
        + 'access at this address.';
      self._publisher.error('get-user-media', 'denied', {
        data: {
          audioConstraints: audioConstraints,
          error: error
        }
      }, self);
    } else {
      code = 31201;
      message = 'Error occurred while accessing microphone: ' + error.name
        + (error.message ? ' (' + error.message + ')' : '');

      self._publisher.error('get-user-media', 'failed', {
        data: {
          audioConstraints: audioConstraints,
          error: error
        }
      }, self);
    }

    return self._die(message, code);
  });
};
Connection.prototype.reject = function(handler) {
  if (typeof handler === 'function') {
    this.addListener('reject', handler);
    return;
  }

  if (this._status !== 'pending') {
    return;
  }

  var payload = { callsid: this.parameters.CallSid };
  this.pstream.publish('reject', payload);
  this.emit('reject');
  this.mediaStream.reject(this.parameters.CallSid);
  this._publisher.info('connection', 'rejected-by-local', null, this);
};
Connection.prototype.ignore = function(handler) {
  if (typeof handler === 'function') {
    this.addListener('cancel', handler);
    return;
  }

  if (this._status !== 'pending') {
    return;
  }

  this._status = 'closed';
  this.emit('cancel');
  this.mediaStream.ignore(this.parameters.CallSid);
  this._publisher.info('connection', 'ignored-by-local', null, this);
};
Connection.prototype.cancel = function(handler) {
  this.log.deprecated('.cancel() is deprecated. Please use .ignore() instead.');
  this.ignore(handler);
};
Connection.prototype.disconnect = function(handler) {
  if (typeof handler === 'function') {
    this.addListener('disconnect', handler);
    return;
  }
  this._disconnect();
};
Connection.prototype._disconnect = function(message, remote) {
  message = typeof message === 'string' ? message : null;

  if (this._status !== 'open' && this._status !== 'connecting' && this._status !== 'ringing') {
    return;
  }

  this.log('Disconnecting...');

  // send pstream hangup message
  if (this.pstream !== null && this.pstream.status !== 'disconnected' && this.sendHangup) {
    var callId = this.parameters.CallSid || this.outboundConnectionId;
    if (callId) {
      var payload = { callsid: callId };
      if (message) {
        payload.message = message;
      }
      this.pstream.publish('hangup', payload);
    }
  }

  cleanupEventListeners(this);

  this.mediaStream.close();

  if (!remote) {
    this._publisher.info('connection', 'disconnected-by-local', null, this);
  }
};
Connection.prototype.error = function(handler) {
  if (typeof handler === 'function') {
    this.addListener('error', handler);
    return;
  }
};
Connection.prototype._die = function(message, code) {
  this._disconnect();
  this.emit('error', { message: message, code: code });
};

Connection.prototype._setCallSid = function _setCallSid(payload) {
  var callSid = payload.callsid;
  if (!callSid) { return; }

  this.parameters.CallSid = callSid;
  this.mediaStream.callSid = callSid;
};

Connection.prototype._setSinkIds = function _setSinkIds(sinkIds) {
  return this.mediaStream._setSinkIds(sinkIds);
};

Connection.prototype._setInputTracksFromStream = function _setInputTracksFromStream(stream) {
  return this.mediaStream.setInputTracksFromStream(stream);
};

/**
 * When we get a RINGING signal from PStream, update the {@link Connection} status.
 */
Connection.prototype._onRinging = function(payload) {
  this._setCallSid(payload);

  // If we're not in 'connecting' or 'ringing' state, this event was received out of order.
  if (this._status !== 'connecting' && this._status !== 'ringing') {
    return;
  }

  var hasEarlyMedia = !!payload.sdp;
  if (this.options.enableRingingState) {
    this._status = 'ringing';
    this._publisher.info('connection', 'outgoing-ringing', { hasEarlyMedia: hasEarlyMedia }, this);
    this.emit('ringing', hasEarlyMedia);
  // answerOnBridge=false will send a 183, which we need to interpret as `answer` when
  // the enableRingingState flag is disabled in order to maintain a non-breaking API from 1.4.24
  } else if (hasEarlyMedia) {
    this._onAnswer(payload);
  }
};

Connection.prototype._onAnswer = function(payload) {
  // answerOnBridge=false will send a 183 which we need to catch in _onRinging when
  // the enableRingingState flag is disabled. In that case, we will receive a 200 after
  // the callee accepts the call firing a second `accept` event if we don't
  // short circuit here.
  if (this._isAnswered) {
    return;
  }

  this._setCallSid(payload);
  this._isAnswered = true;
  this._maybeTransitionToOpen();
};

Connection.prototype._maybeTransitionToOpen = function() {
  if (this.mediaStream && this.mediaStream.status === 'open' && this._isAnswered) {
    this._status = 'open';
    this.emit('accept', this);
  }
};

/**
 * Fired on `requestAnimationFrame` (up to 60fps, depending on browser) with
 *   the current input and output volumes, as a percentage of maximum
 *   volume, between -100dB and -30dB. Represented by a floating point
 *   number between 0.0 and 1.0, inclusive.
 * @param {function(number inputVolume, number outputVolume)} handler
 */
Connection.prototype.volume = function(handler) {
  if (!window || (!window.AudioContext && !window.webkitAudioContext)) {
    // eslint-disable-next-line no-console
    console.warn('This browser does not support Connection.volume');
  } else if (typeof handler === 'function') {
    this.on('volume', handler);
  }
};

/**
 * Get the local MediaStream, if set.
 * @returns {?MediaStream}
 */
Connection.prototype.getLocalStream = function getLocalStream() {
  return this.mediaStream && this.mediaStream.stream;
};

/**
 * Get the remote MediaStream, if set.
 * @returns {?MediaStream}
 */
Connection.prototype.getRemoteStream = function getRemoteStream() {
  return this.mediaStream && this.mediaStream._remoteStream;
};

/**
 * Post an event to Endpoint Analytics indicating that the end user
 *   has given call quality feedback. Called without a score, this
 *   will report that the customer declined to give feedback.
 * @param {?Number} [score] - The end-user's rating of the call; an
 *   integer 1 through 5. Or undefined if the user declined to give
 *   feedback.
 * @param {?String} [issue] - The primary issue the end user
 *   experienced on the call. Can be: ['one-way-audio', 'choppy-audio',
 *   'dropped-call', 'audio-latency', 'noisy-call', 'echo']
 * @returns {Promise}
 */
Connection.prototype.postFeedback = function(score, issue) {
  if (typeof score === 'undefined' || score === null) {
    return this._postFeedbackDeclined();
  }

  if (FEEDBACK_SCORES.indexOf(score) === -1) {
    throw new Error('Feedback score must be one of: ' + FEEDBACK_SCORES);
  }

  if (typeof issue !== 'undefined' && issue !== null && FEEDBACK_ISSUES.indexOf(issue) === -1) {
    throw new Error('Feedback issue must be one of: ' + FEEDBACK_ISSUES);
  }

  return this._publisher.post('info', 'feedback', 'received', {
    /* eslint-disable camelcase */
    quality_score: score,
    issue_name: issue
    /* eslint-enable camelcase */
  }, this, true);
};

/**
 * Post an event to Endpoint Analytics indicating that the end user
 *   has ignored a request for feedback.
 * @private
 * @returns {Promise}
 */
Connection.prototype._postFeedbackDeclined = function() {
  return this._publisher.post('info', 'feedback', 'received-none', null, this, true);
};

Connection.prototype._getTempCallSid = function() {
  return this.outboundConnectionId;
};

Connection.prototype._getRealCallSid = function() {
  return /^TJ/.test(this.parameters.CallSid) ? null : this.parameters.CallSid;
};

function cleanupEventListeners(connection) {
  function cleanup() {
    if (connection.pstream) {
      connection.pstream.removeListener('cancel', connection._onCancel);
      connection.pstream.removeListener('hangup', connection._onHangup);
    }
  }
  cleanup();
  // This is kind of a hack, but it lets us avoid rewriting more code.
  // Basically, there's a sequencing problem with the way PeerConnection raises
  // the
  //
  //   Cannot establish connection. Client is disconnected
  //
  // error in Connection#accept. It calls PeerConnection#onerror, which emits
  // the error event on Connection. An error handler on Connection then calls
  // cleanupEventListeners, but then control returns to Connection#accept. It's
  // at this point that we add a listener for the answer event that never gets
  // removed. setTimeout will allow us to rerun cleanup again, _after_
  // Connection#accept returns.
  setTimeout(cleanup, 0);
}

exports.Connection = Connection;

},{"./log":8,"./rtc":14,"./rtc/monitor":16,"./util":27,"events":34,"util":49}],5:[function(require,module,exports){
'use strict';

var AudioHelper = require('./audiohelper');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var log = require('./log');
var twutil = require('./util');
var rtc = require('./rtc');
var Publisher = require('./eventpublisher');
var Options = require('./options').Options;
var Sound = require('./sound');
var Connection = require('./connection').Connection;
var getUserMedia = require('./rtc/getusermedia');
var PStream = require('./pstream').PStream;

var REG_INTERVAL = 30000;
var RINGTONE_PLAY_TIMEOUT = 2000;

/**
 * Constructor for Device objects.
 *
 * @exports Device as Twilio.Device
 * @memberOf Twilio
 * @borrows EventEmitter#addListener as #addListener
 * @borrows EventEmitter#emit as #emit
 * @borrows EventEmitter#hasListener #hasListener
 * @borrows EventEmitter#removeListener as #removeListener
 * @borrows Twilio.mixinLog-log as #log
 * @constructor
 * @param {string} token The Twilio capabilities token
 * @param {object} [options]
 * @config {boolean} [debug=false]
 */
function Device(token, options) {
  if (!rtc.enabled()) {
    throw new twutil.Exception('twilio.js 1.3 requires WebRTC/ORTC browser support. '
      + 'For more information, see <https://www.twilio.com/docs/api/client/twilio-js>. '
      + 'If you have any questions about this announcement, please contact '
      + 'Twilio Support at <help@twilio.com>.');
  }

  if (!(this instanceof Device)) {
    return new Device(token, options);
  }
  twutil.monitorEventEmitter('Twilio.Device', this);
  if (!token) {
    throw new twutil.Exception('Capability token is not valid or missing.');
  }

  // copy options
  options = options || { };
  var origOptions = { };
  for (var i in options) {
    origOptions[i] = options[i];
  }

  // (rrowland) Lint: This constructor should not be lower case, but if we don't support
  //   the prior name we may break something.
  var DefaultSound = options.soundFactory || Sound;

  var defaults = {
    logPrefix: '[Device]',
    chunderw: 'chunderw-vpc-gll.twilio.com',
    eventgw: 'eventgw.twilio.com',
    Sound: DefaultSound,
    connectionFactory: Connection,
    pStreamFactory: PStream,
    noRegister: false,
    encrypt: false,
    closeProtection: false,
    secureSignaling: true,
    warnings: true,
    audioConstraints: true,
    iceServers: [],
    region: 'gll',
    dscp: true,
    sounds: { }
  };
  options = options || {};
  var chunderw = options.chunderw;
  for (var prop in defaults) {
    if (prop in options) continue;
    options[prop] = defaults[prop];
  }

  if (options.dscp) {
    options.rtcConstraints = {
      optional: [
        {
          googDscp: true
        }
      ]
    };
  } else {
    options.rtcConstraints = {};
  }

  this.options = options;
  this.token = token;
  this._status = 'offline';
  this._region = 'offline';
  this._connectionSinkIds = ['default'];
  this._connectionInputStream = null;
  this.connections = [];
  this._activeConnection = null;
  this.sounds = new Options({
    incoming: true,
    outgoing: true,
    disconnect: true
  });

  log.mixinLog(this, this.options.logPrefix);
  this.log.enabled = this.options.debug;

  var regions = {
    gll: 'chunderw-vpc-gll.twilio.com',
    au1: 'chunderw-vpc-gll-au1.twilio.com',
    br1: 'chunderw-vpc-gll-br1.twilio.com',
    de1: 'chunderw-vpc-gll-de1.twilio.com',
    ie1: 'chunderw-vpc-gll-ie1.twilio.com',
    jp1: 'chunderw-vpc-gll-jp1.twilio.com',
    sg1: 'chunderw-vpc-gll-sg1.twilio.com',
    us1: 'chunderw-vpc-gll-us1.twilio.com',
    'us1-tnx': 'chunderw-vpc-gll-us1-tnx.twilio.com',
    'us2-tnx': 'chunderw-vpc-gll-us2-tnx.twilio.com',
    'ie1-tnx': 'chunderw-vpc-gll-ie1-tnx.twilio.com',
    'us1-ix': 'chunderw-vpc-gll-us1-ix.twilio.com',
    'us2-ix': 'chunderw-vpc-gll-us2-ix.twilio.com',
    'ie1-ix': 'chunderw-vpc-gll-ie1-ix.twilio.com'
  };
  var deprecatedRegions = {
    au: 'au1',
    br: 'br1',
    ie: 'ie1',
    jp: 'jp1',
    sg: 'sg1',
    'us-va': 'us1',
    'us-or': 'us1'
  };
  var region = options.region.toLowerCase();
  if (region in deprecatedRegions) {
    this.log.deprecated('Region ' + region + ' is deprecated, please use '
      + deprecatedRegions[region] + '.');
    region = deprecatedRegions[region];
  }
  if (!(region in regions)) {
    throw new twutil.Exception('Region ' + options.region + ' is invalid. ' +
      'Valid values are: ' + Object.keys(regions).join(', '));
  }
  options.chunderw = chunderw || regions[region];

  this.soundcache = new Map();

  // NOTE(mroberts): Node workaround.
  var a = typeof document !== 'undefined'
    ? document.createElement('audio') : { };

  var canPlayMp3;
  try {
    canPlayMp3 = a.canPlayType
      && !!a.canPlayType('audio/mpeg').replace(/no/, '');
  } catch (e) {
    canPlayMp3 = false;
  }

  var canPlayVorbis;
  try {
    canPlayVorbis = a.canPlayType
      && !!a.canPlayType('audio/ogg;codecs=\'vorbis\'').replace(/no/, '');
  } catch (e) {
    canPlayVorbis = false;
  }

  var ext = 'mp3';
  if (canPlayVorbis && !canPlayMp3) {
    ext = 'ogg';
  }

  var defaultSounds = {
    incoming: { filename: 'incoming', shouldLoop: true },
    outgoing: { filename: 'outgoing', maxDuration: 3000 },
    disconnect: { filename: 'disconnect', maxDuration: 3000 },
    dtmf1: { filename: 'dtmf-1', maxDuration: 1000 },
    dtmf2: { filename: 'dtmf-2', maxDuration: 1000 },
    dtmf3: { filename: 'dtmf-3', maxDuration: 1000 },
    dtmf4: { filename: 'dtmf-4', maxDuration: 1000 },
    dtmf5: { filename: 'dtmf-5', maxDuration: 1000 },
    dtmf6: { filename: 'dtmf-6', maxDuration: 1000 },
    dtmf7: { filename: 'dtmf-7', maxDuration: 1000 },
    dtmf8: { filename: 'dtmf-8', maxDuration: 1000 },
    dtmf9: { filename: 'dtmf-9', maxDuration: 1000 },
    dtmf0: { filename: 'dtmf-0', maxDuration: 1000 },
    dtmfs: { filename: 'dtmf-star', maxDuration: 1000 },
    dtmfh: { filename: 'dtmf-hash', maxDuration: 1000 }
  };

  var base = twutil.getTwilioRoot() + 'sounds/releases/' + twutil.getSoundVersion() + '/';
  for (var name in defaultSounds) {
    var soundDef = defaultSounds[name];

    var defaultUrl = base + soundDef.filename + '.' + ext + '?cache=1_4_23';
    var soundUrl = options.sounds[name] || defaultUrl;
    var sound = new this.options.Sound(name, soundUrl, {
      maxDuration: soundDef.maxDuration,
      minDuration: soundDef.minDuration,
      shouldLoop: soundDef.shouldLoop,
      audioContext: this.options.disableAudioContextSounds ? null : Device.audioContext
    });

    this.soundcache.set(name, sound);
  }

  var self = this;

  function createDefaultPayload(connection) {
    var payload = {
      /* eslint-disable camelcase */
      client_name: self._clientName,
      platform: rtc.getMediaEngine(),
      sdk_version: twutil.getReleaseVersion(),
      selected_region: self.options.region
      /* eslint-enable camelcase */
    };

    function setIfDefined(propertyName, value) {
      if (value) { payload[propertyName] = value; }
    }

    if (connection) {
      setIfDefined('call_sid', connection._getRealCallSid());
      setIfDefined('temp_call_sid', connection._getTempCallSid());
      payload.direction = connection._direction;
    }

    var stream = self.stream;
    if (stream) {
      setIfDefined('gateway', stream.gateway);
      setIfDefined('region', stream.region);
    }

    return payload;
  }

  var publisher = this._publisher = new Publisher('twilio-js-sdk', this.token, {
    host: this.options.eventgw,
    defaultPayload: createDefaultPayload
  });

  if (options.publishEvents === false) {
    publisher.disable();
  }

  function updateSinkIds(type, sinkIds) {
    var promise = type === 'ringtone'
      ? updateRingtoneSinkIds(sinkIds)
      : updateSpeakerSinkIds(sinkIds);

    return promise.then(function() {
      publisher.info('audio', type + '-devices-set', {
        // eslint-disable-next-line camelcase
        audio_device_ids: sinkIds
      }, self._activeConnection);
    }, function(error) {
      publisher.error('audio', type + '-devices-set-failed', {
        // eslint-disable-next-line camelcase
        audio_device_ids: sinkIds,
        message: error.message
      }, self._activeConnection);

      throw error;
    });
  }

  function updateSpeakerSinkIds(sinkIds) {
    sinkIds = sinkIds.forEach ? sinkIds : [sinkIds];
    Array.from(self.soundcache.entries()).forEach(function(entry) {
      if (entry[0] !== 'incoming') {
        entry[1].setSinkIds(sinkIds);
      }
    });

    // To be used in new connections
    self._connectionSinkIds = sinkIds;

    // To be used in existing connections
    var connection = self._activeConnection;
    return connection
      ? connection._setSinkIds(sinkIds)
      : Promise.resolve();
  }

  function updateRingtoneSinkIds(sinkIds) {
    return Promise.resolve(self.soundcache.get('incoming').setSinkIds(sinkIds));
  }

  function updateInputStream(inputStream) {
    var connection = self._activeConnection;

    if (connection && !inputStream) {
      return Promise.reject(new Error('Cannot unset input device while a call is in progress.'));
    }

    // To be used in new connections
    self._connectionInputStream = inputStream;

    // To be used in existing connections
    return connection
      ? connection._setInputTracksFromStream(inputStream)
      : Promise.resolve();
  }

  var audio = this.audio = new AudioHelper(updateSinkIds, updateInputStream, getUserMedia, {
    audioContext: Device.audioContext,
    logEnabled: !!this.options.debug,
    logWarnings: !!this.options.warnings,
    soundOptions: this.sounds
  });

  audio.on('deviceChange', function(lostActiveDevices) {
    var activeConnection = self._activeConnection;
    var deviceIds = lostActiveDevices.map(function(device) { return device.deviceId; });

    publisher.info('audio', 'device-change', {
      // eslint-disable-next-line camelcase
      lost_active_device_ids: deviceIds
    }, activeConnection);

    if (activeConnection) {
      activeConnection.mediaStream._onInputDevicesChanged();
    }
  });

  // setup flag for allowing presence for media types
  this.mediaPresence = { audio: !this.options.noRegister };

  // setup stream
  this.register(this.token);

  var closeProtection = this.options.closeProtection;
  // eslint-disable-next-line consistent-return
  function confirmClose(event) {
    if (self._activeConnection) {
      var defaultMsg = 'A call is currently in-progress. '
        + 'Leaving or reloading this page will end the call.';
      var confirmationMsg = closeProtection === true ? defaultMsg : closeProtection;
      (event || window.event).returnValue = confirmationMsg;
      return confirmationMsg;
    }
  }

  if (closeProtection) {
    if (typeof window !== 'undefined') {
      if (window.addEventListener) {
        window.addEventListener('beforeunload', confirmClose);
      } else if (window.attachEvent) {
        window.attachEvent('onbeforeunload', confirmClose);
      }
    }
  }

  // close connections on unload
  function onClose() {
    self.disconnectAll();
  }

  if (typeof window !== 'undefined') {
    if (window.addEventListener) {
      window.addEventListener('unload', onClose);
    } else if (window.attachEvent) {
      window.attachEvent('onunload', onClose);
    }
  }

  // NOTE(mroberts): EventEmitter requires that we catch all errors.
  this.on('error', function() {});

  return this;
}

util.inherits(Device, EventEmitter);

function makeConnection(device, params, options) {
  var defaults = {
    getSinkIds: function() { return device._connectionSinkIds; },
    getInputStream: function() { return device._connectionInputStream; },
    debug: device.options.debug,
    encrypt: device.options.encrypt,
    warnings: device.options.warnings,
    publisher: device._publisher,
    enableRingingState: device.options.enableRingingState
  };

  options = options || {};
  for (var prop in defaults) {
    if (prop in options) continue;
    options[prop] = defaults[prop];
  }

  var connection = device.options.connectionFactory(device, params, getUserMedia, options);

  connection.once('accept', function() {
    device._activeConnection = connection;
    device._removeConnection(connection);
    device.audio._maybeStartPollingVolume();
    device.emit('connect', connection);
  });
  connection.addListener('error', function(error) {
    if (connection.status() === 'closed') {
      device._removeConnection(connection);
    }
    device.audio._maybeStopPollingVolume();
    device.emit('error', error);
  });
  connection.once('cancel', function() {
    device.log('Canceled: ' + connection.parameters.CallSid);
    device._removeConnection(connection);
    device.audio._maybeStopPollingVolume();
    device.emit('cancel', connection);
  });
  connection.once('disconnect', function() {
    device.audio._maybeStopPollingVolume();
    device._removeConnection(connection);
    if (device._activeConnection === connection) {
      device._activeConnection = null;
    }
    device.emit('disconnect', connection);
  });
  connection.once('reject', function() {
    device.log('Rejected: ' + connection.parameters.CallSid);
    device.audio._maybeStopPollingVolume();
    device._removeConnection(connection);
  });

  return connection;
}

/**
 * @return {string}
 */
Device.toString = function() {
  return '[Twilio.Device class]';
};

/**
 * @return {string}
 */
Device.prototype.toString = function() {
  return '[Twilio.Device instance]';
};
Device.prototype.register = function(token) {
  var objectized = twutil.objectize(token);
  this._accountSid = objectized.iss;
  this._clientName = objectized.scope['client:incoming']
    ? objectized.scope['client:incoming'].params.clientName : null;

  if (this.stream) {
    this.stream.setToken(token);
    this._publisher.setToken(token);
  } else {
    this._setupStream(token);
  }
};
Device.prototype.registerPresence = function() {
  if (!this.token) {
    return;
  }

  // check token, if incoming capable then set mediaPresence capability to true
  var tokenIncomingObject = twutil.objectize(this.token).scope['client:incoming'];
  if (tokenIncomingObject) {
    this.mediaPresence.audio = true;
  }

  this._sendPresence();
};
Device.prototype.unregisterPresence = function() {
  this.mediaPresence.audio = false;
  this._sendPresence();
};
Device.prototype.connect = function(params, audioConstraints) {
  if (typeof params === 'function') {
    return this.addListener('connect', params);
  }

  if (this._activeConnection) {
    throw new Error('A Connection is already active');
  }

  params = params || {};
  audioConstraints = audioConstraints || this.options.audioConstraints;
  var connection = this._activeConnection = makeConnection(this, params);

  // Make sure any incoming connections are ignored
  this.connections.splice(0).forEach(function(conn) {
    conn.ignore();
  });

  // Stop the incoming sound if it's playing
  this.soundcache.get('incoming').stop();

  if (this.sounds.__dict__.outgoing) {
    var self = this;
    connection.accept(function() {
      self.soundcache.get('outgoing').play();
    });
  }
  connection.accept(audioConstraints);
  return connection;
};
Device.prototype.disconnectAll = function() {
  // Create a copy of connections before iterating, because disconnect
  // will trigger callbacks which modify the connections list. At the end
  // of the iteration, this.connections should be an empty list.
  var connections = [].concat(this.connections);
  for (var i = 0; i < connections.length; i++) {
    connections[i].disconnect();
  }
  if (this._activeConnection) {
    this._activeConnection.disconnect();
  }
  if (this.connections.length > 0) {
    this.log('Connections left pending: ' + this.connections.length);
  }
};
Device.prototype.destroy = function() {
  this._stopRegistrationTimer();
  this.audio._unbind();
  if (this.stream) {
    this.stream.destroy();
    this.stream = null;
  }
};
Device.prototype.disconnect = function(handler) {
  this.addListener('disconnect', handler);
};
Device.prototype.incoming = function(handler) {
  this.addListener('incoming', handler);
};
Device.prototype.offline = function(handler) {
  this.addListener('offline', handler);
};
Device.prototype.ready = function(handler) {
  this.addListener('ready', handler);
};
Device.prototype.error = function(handler) {
  this.addListener('error', handler);
};
Device.prototype.status = function() {
  return this._activeConnection ? 'busy' : this._status;
};
Device.prototype.activeConnection = function() {
  // @rrowland This should only return activeConnection, but customers have built around this
  // broken behavior and in order to not break their apps we are including this until
  // the next big release.
  // (TODO) Remove the second half of this statement in the next breaking release
  return this._activeConnection || this.connections[0];
};
Device.prototype.region = function() {
  return this._region;
};
Device.prototype._sendPresence = function() {
  if (!this.stream) { return; }

  this.stream.register(this.mediaPresence);
  if (this.mediaPresence.audio) {
    this._startRegistrationTimer();
  } else {
    this._stopRegistrationTimer();
  }
};
Device.prototype._startRegistrationTimer = function() {
  clearTimeout(this.regTimer);
  var self = this;
  this.regTimer = setTimeout( function() {
    self._sendPresence();
  }, REG_INTERVAL);
};
Device.prototype._stopRegistrationTimer = function() {
  clearTimeout(this.regTimer);
};
Device.prototype._setupStream = function(token) {
  var self = this;
  this.log('Setting up PStream');
  var streamOptions = {
    chunderw: this.options.chunderw,
    debug: this.options.debug,
    secureSignaling: this.options.secureSignaling
  };
  this.stream = this.options.pStreamFactory(token, streamOptions);
  this.stream.addListener('connected', function(payload) {
    var regions = {
      US_EAST_VIRGINIA: 'us1',
      US_WEST_OREGON: 'us2',
      ASIAPAC_SYDNEY: 'au1',
      SOUTH_AMERICA_SAO_PAULO: 'br1',
      EU_IRELAND: 'ie1',
      ASIAPAC_TOKYO: 'jp1',
      ASIAPAC_SINGAPORE: 'sg1'
    };
    self._region = regions[payload.region] || payload.region;
    self._sendPresence();
  });
  this.stream.addListener('close', function() {
    self.stream = null;
  });
  this.stream.addListener('ready', function() {
    self.log('Stream is ready');
    if (self._status === 'offline') {
      self._status = 'ready';
    }
    self.emit('ready', self);
  });
  this.stream.addListener('offline', function() {
    self.log('Stream is offline');
    self._status = 'offline';
    self._region = 'offline';
    self.emit('offline', self);
  });
  this.stream.addListener('error', function(payload) {
    var error = payload.error;
    if (error) {
      if (payload.callsid) {
        error.connection = self._findConnection(payload.callsid);
      }
      // Stop trying to register presence after token expires
      if (error.code === 31205) {
        self._stopRegistrationTimer();
      }
      self.log('Received error: ', error);
      self.emit('error', error);
    }
  });
  this.stream.addListener('invite', function(payload) {
    if (self._activeConnection) {
      self.log('Device busy; ignoring incoming invite');
      return;
    }

    if (!payload.callsid || !payload.sdp) {
      self.emit('error', { message: 'Malformed invite from gateway' });
      return;
    }

    var params = payload.parameters || { };
    params.CallSid = params.CallSid || payload.callsid;

    function maybeStopIncomingSound() {
      if (!self.connections.length) {
        self.soundcache.get('incoming').stop();
      }
    }

    var connection = makeConnection(self, {}, {
      offerSdp: payload.sdp,
      callParameters: params
    });

    self.connections.push(connection);

    connection.once('accept', function() {
      self.soundcache.get('incoming').stop();
    });

    ['cancel', 'error', 'reject'].forEach(function(event) {
      connection.once(event, maybeStopIncomingSound);
    });

    var play = self.sounds.__dict__.incoming
      ? function() { return self.soundcache.get('incoming').play(); }
      : function() { return Promise.resolve(); };

    self._showIncomingConnection(connection, play);
  });
};

Device.prototype._showIncomingConnection = function(connection, play) {
  var self = this;
  var timeout;
  return Promise.race([
    play(),
    new Promise(function(resolve, reject) {
      timeout = setTimeout(function() {
        reject(new Error('Playing incoming ringtone took too long; it might not play. Continuing execution...'));
      }, RINGTONE_PLAY_TIMEOUT);
    })
  ]).catch(function(reason) {
    // eslint-disable-next-line no-console
    console.warn(reason.message);
  }).then(function() {
    clearTimeout(timeout);
    self.emit('incoming', connection);
  });
};

Device.prototype._removeConnection = function(connection) {
  for (var i = this.connections.length - 1; i >= 0; i--) {
    if (connection === this.connections[i]) {
      this.connections.splice(i, 1);
    }
  }
};
Device.prototype._findConnection = function(callsid) {
  for (var i = 0; i < this.connections.length; i++) {
    var conn = this.connections[i];
    if (conn.parameters.CallSid === callsid || conn.outboundConnectionId === callsid) {
      return conn;
    }
  }

  return null;
};

function singletonwrapper(cls) {
  var afterSetup = [];
  var tasks = [];
  function enqueue(task) {
    if (cls.instance) {
      task();
    } else {
      tasks.push(task);
    }
  }

  function defaultErrorHandler(error) {
    var errorMessage = (error.code ? error.code + ': ' : '') + error.message;
    if (cls.instance) {
      // The defaultErrorHandler throws an Exception iff there are no
      // other error handlers registered on a Device instance. To check
      // this, we need to count up the number of error handlers
      // registered, excluding our own defaultErrorHandler.
      var n = 0;
      var listeners = cls.instance.listeners('error');
      for (var i = 0; i < listeners.length; i++) {
        if (listeners[i] !== defaultErrorHandler) {
          n++;
        }
      }
      // Note that there is always one default, noop error handler on
      // each of our EventEmitters.
      if (n > 1) {
        return;
      }
      cls.instance.log(errorMessage);
    }
    throw new twutil.Exception(errorMessage);
  }
  var members = /** @lends Twilio.Device */ {
    /**
     * Instance of Twilio.Device.
     *
     * @type Twilio.Device
     */
    instance: null,
    /**
     * @param {string} token
     * @param {object} [options]
     * @return {Twilio.Device}
     */
    setup: function(token, options) {
      if (!cls.audioContext) {
        if (typeof AudioContext !== 'undefined') {
          cls.audioContext = new AudioContext();
        } else if (typeof webkitAudioContext !== 'undefined') {
          // eslint-disable-next-line
          cls.audioContext = new webkitAudioContext();
        }
      }

      var i;
      if (cls.instance) {
        cls.instance.log('Found existing Device; using new token but ignoring options');
        cls.instance.token = token;
        cls.instance.register(token);
      } else {
        cls.instance = new Device(token, options);
        cls.error(defaultErrorHandler);
        cls.sounds = cls.instance.sounds;
        for (i = 0; i < tasks.length; i++) {
          tasks[i]();
        }
        tasks = [];
      }

      for (i = 0; i < afterSetup.length; i++) {
        afterSetup[i](token, options);
      }
      afterSetup = [];

      return cls;
    },

    /**
     * Connects to Twilio.
     *
     * @param {object} parameters
     * @return {Twilio.Connection}
     */
    connect: function(parameters, audioConstraints) {
      if (typeof parameters === 'function') {
        enqueue(function() {
          cls.instance.addListener('connect', parameters);
        });
        return null;
      }
      if (!cls.instance) {
        throw new twutil.Exception('Run Twilio.Device.setup()');
      }
      if (cls.instance.connections.length > 0) {
        cls.instance.emit('error',
          { message: 'A connection is currently active' });
        return null;
      }
      return cls.instance.connect(parameters, audioConstraints);
    },

    /**
     * @return {Twilio.Device}
     */
    disconnectAll: function() {
      enqueue(function() {
        cls.instance.disconnectAll();
      });
      return cls;
    },
    /**
     * @param {function} handler
     * @return {Twilio.Device}
     */
    disconnect: function(handler) {
      enqueue(function() {
        cls.instance.addListener('disconnect', handler);
      });
      return cls;
    },
    status: function() {
      if (!cls.instance) {
        throw new twutil.Exception('Run Twilio.Device.setup()');
      }
      return cls.instance.status();
    },
    region: function() {
      if (!cls.instance) {
        throw new twutil.Exception('Run Twilio.Device.setup()');
      }
      return cls.instance.region();
    },
    /**
     * @param {function} handler
     * @return {Twilio.Device}
     */
    ready: function(handler) {
      enqueue(function() {
        cls.instance.addListener('ready', handler);
      });
      return cls;
    },

    /**
     * @param {function} handler
     * @return {Twilio.Device}
     */
    error: function(handler) {
      enqueue(function() {
        if (handler !== defaultErrorHandler) {
          cls.instance.removeListener('error', defaultErrorHandler);
        }
        cls.instance.addListener('error', handler);
      });
      return cls;
    },

    /**
     * @param {function} handler
     * @return {Twilio.Device}
     */
    offline: function(handler) {
      enqueue(function() {
        cls.instance.addListener('offline', handler);
      });
      return cls;
    },

    /**
     * @param {function} handler
     * @return {Twilio.Device}
     */
    incoming: function(handler) {
      enqueue(function() {
        cls.instance.addListener('incoming', handler);
      });
      return cls;
    },

    /**
     * @return {Twilio.Device}
     */
    destroy: function() {
      if (cls.instance) {
        cls.instance.destroy();
      }
      return cls;
    },

    /**
     * @return {Twilio.Device}
     */
    cancel: function(handler) {
      enqueue(function() {
        cls.instance.addListener('cancel', handler);
      });
      return cls;
    },

    activeConnection: function() {
      if (!cls.instance) {
        return null;
      }
      return cls.instance.activeConnection();
    }
  };

  for (var method in members) {
    cls[method] = members[method];
  }

  Object.defineProperties(cls, {
    audio: {
      get: function() { return cls.instance.audio; }
    }
  });

  return cls;
}

exports.Device = singletonwrapper(Device);

},{"./audiohelper":3,"./connection":4,"./eventpublisher":6,"./log":8,"./options":9,"./pstream":11,"./rtc":14,"./rtc/getusermedia":13,"./sound":24,"./util":27,"events":34,"util":49}],6:[function(require,module,exports){
'use strict';

var request = require('./request');

/**
 * Builds Endpoint Analytics (EA) event payloads and sends them to
 *   the EA server.
 * @constructor
 * @param {String} productName - Name of the product publishing events.
 * @param {String} token - The JWT token to use to authenticate with
 *   the EA server.
 * @param {EventPublisher.Options} options
 * @property {Boolean} isEnabled - Whether or not this publisher is publishing
 *   to the server. Currently ignores the request altogether, in the future this
 *   may store them in case publishing is re-enabled later. Defaults to true.
 *//**
 * @typedef {Object} EventPublisher.Options
 * @property {String} [host='eventgw.twilio.com'] - The host address of the EA
 *   server to publish to.
 * @property {Object|Function} [defaultPayload] - A default payload to extend
 *   when creating and sending event payloads. Also takes a function that
 *   should return an object representing the default payload. This is
 *   useful for fields that should always be present when they are
 *   available, but are not always available.
 */
function EventPublisher(productName, token, options) {
  if (!(this instanceof EventPublisher)) {
    return new EventPublisher(productName, token, options);
  }

  // Apply default options
  options = Object.assign({
    defaultPayload: function() { return { }; },
    host: 'eventgw.twilio.com'
  }, options);

  var defaultPayload = options.defaultPayload;

  if (typeof defaultPayload !== 'function') {
    defaultPayload = function() { return Object.assign({ }, options.defaultPayload); };
  }

  var isEnabled = true;
  Object.defineProperties(this, {
    _defaultPayload: { value: defaultPayload },
    _isEnabled: {
      get: function() { return isEnabled; },
      set: function(_isEnabled) { isEnabled = _isEnabled; }
    },
    _host: { value: options.host },
    _request: { value: options.request || request },
    _token: { value: token, writable: true },
    isEnabled: {
      enumerable: true,
      get: function() { return isEnabled; }
    },
    productName: { enumerable: true, value: productName },
    token: {
      enumerable: true,
      get: function() { return this._token; }
    }
  });
}

/**
 * Post to an EA server.
 * @private
 * @param {String} endpointName - Endpoint to post the event to
 * @param {String} level - ['debug', 'info', 'warning', 'error']
 * @param {String} group - The name of the group the event belongs to.
 * @param {String} name - The designated event name.
 * @param {?Object} [payload=null] - The payload to pass. This will be extended
 *    onto the default payload object, if one exists.
 * @param {?Connection} [connection=null] - The {@link Connection} which is posting this payload.
 * @param {?Boolean} [force=false] - Whether or not to send this even if
 *    publishing is disabled.
 * @returns {Promise} Fulfilled if the HTTP response is 20x.
 */
EventPublisher.prototype._post = function _post(endpointName, level, group, name, payload, connection, force) {
  if (!this.isEnabled && !force) { return Promise.resolve(); }

  var event = {
    /* eslint-disable camelcase */
    publisher: this.productName,
    group: group,
    name: name,
    timestamp: (new Date()).toISOString(),
    level: level.toUpperCase(),
    payload_type: 'application/json',
    private: false,
    payload: (payload && payload.forEach) ?
      payload.slice(0) : Object.assign(this._defaultPayload(connection), payload)
    /* eslint-enable camelcase */
  };

  var requestParams = {
    url: 'https://' + this._host + '/v2/' + endpointName,
    body: event,
    headers: {
      'Content-Type': 'application/json',
      'X-Twilio-Token': this.token
    }
  };

  var self = this;
  return new Promise(function(resolve, reject) {
    self._request.post(requestParams, function(err) {
      if (err) { reject(err); }
      else { resolve(); }
    });
  });
};

/**
 * Post an event to the EA server. Use this method when the level
 *  is dynamic. Otherwise, it's better practice to use the sugar
 *  methods named for the specific level.
 * @param {String} level - ['debug', 'info', 'warning', 'error']
 * @param {String} group - The name of the group the event belongs to.
 * @param {String} name - The designated event name.
 * @param {?Object} [payload=null] - The payload to pass. This will be extended
 *    onto the default payload object, if one exists.
 * @param {?Connection} [connection=null] - The {@link Connection} which is posting this payload.
 * @returns {Promise} Fulfilled if the HTTP response is 20x.
 */
EventPublisher.prototype.post = function post(level, group, name, payload, connection, force) {
  return this._post('EndpointEvents', level, group, name, payload, connection, force);
};

/**
 * Post a debug-level event to the EA server.
 * @param {String} group - The name of the group the event belongs to.
 * @param {String} name - The designated event name.
 * @param {?Object} [payload=null] - The payload to pass. This will be extended
 *    onto the default payload object, if one exists.
 * @param {?Connection} [connection=null] - The {@link Connection} which is posting this payload.
 * @returns {Promise} Fulfilled if the HTTP response is 20x.
 */
EventPublisher.prototype.debug = function debug(group, name, payload, connection) {
  return this.post('debug', group, name, payload, connection);
};

/**
 * Post an info-level event to the EA server.
 * @param {String} group - The name of the group the event belongs to.
 * @param {String} name - The designated event name.
 * @param {?Object} [payload=null] - The payload to pass. This will be extended
 *    onto the default payload object, if one exists.
 * @param {?Connection} [connection=null] - The {@link Connection} which is posting this payload.
 * @returns {Promise} Fulfilled if the HTTP response is 20x.
 */
EventPublisher.prototype.info = function info(group, name, payload, connection) {
  return this.post('info', group, name, payload, connection);
};

/**
 * Post a warning-level event to the EA server.
 * @param {String} group - The name of the group the event belongs to.
 * @param {String} name - The designated event name.
 * @param {?Object} [payload=null] - The payload to pass. This will be extended
 *    onto the default payload object, if one exists.
 * @param {?Connection} [connection=null] - The {@link Connection} which is posting this payload.
 * @returns {Promise} Fulfilled if the HTTP response is 20x.
 */
EventPublisher.prototype.warn = function warn(group, name, payload, connection) {
  return this.post('warning', group, name, payload, connection);
};

/**
 * Post an error-level event to the EA server.
 * @param {String} group - The name of the group the event belongs to.
 * @param {String} name - The designated event name.
 * @param {?Object} [payload=null] - The payload to pass. This will be extended
 *    onto the default payload object, if one exists.
 * @param {?Connection} [connection=null] - The {@link Connection} which is posting this payload.
 * @returns {Promise} Fulfilled if the HTTP response is 20x.
 */
EventPublisher.prototype.error = function error(group, name, payload, connection) {
  return this.post('error', group, name, payload, connection);
};

/**
 * Post a metrics event to the EA server.
 * @param {String} group - The name of the group the event belongs to.
 * @param {String} name - The designated event name.
 * @param {Array<Object>} metrics - The metrics to post.
 * @param {?Object} [customFields] - Custom fields to append to each payload.
 * @returns {Promise} Fulfilled if the HTTP response is 20x.
 */
EventPublisher.prototype.postMetrics = function postMetrics(group, name, metrics, customFields) {
  var samples = metrics
    .map(formatMetric)
    .map(function(sample) {
      return Object.assign(sample, customFields);
    });
  return this._post('EndpointMetrics', 'info', group, name, samples);
};

/**
 * Update the token to use to authenticate requests.
 * @param {string} token
 * @returns {void}
 */
EventPublisher.prototype.setToken = function setToken(token) {
  this._token = token;
};

/**
 * Enable the publishing of events.
 */
EventPublisher.prototype.enable = function enable() {
  this._isEnabled = true;
};

/**
 * Disable the publishing of events.
 */
EventPublisher.prototype.disable = function disable() {
  this._isEnabled = false;
};

function formatMetric(sample) {
  return {
    /* eslint-disable camelcase */
    timestamp: (new Date(sample.timestamp)).toISOString(),
    total_packets_received: sample.totals.packetsReceived,
    total_packets_lost: sample.totals.packetsLost,
    total_packets_sent: sample.totals.packetsSent,
    total_bytes_received: sample.totals.bytesReceived,
    total_bytes_sent: sample.totals.bytesSent,
    packets_received: sample.packetsReceived,
    packets_lost: sample.packetsLost,
    packets_lost_fraction: sample.packetsLostFraction &&
    (Math.round(sample.packetsLostFraction * 100) / 100),
    audio_level_in: sample.audioInputLevel,
    audio_level_out: sample.audioOutputLevel,
    call_volume_input: sample.inputVolume,
    call_volume_output: sample.outputVolume,
    jitter: sample.jitter,
    rtt: sample.rtt,
    mos: sample.mos && (Math.round(sample.mos * 100) / 100)
    /* eslint-enable camelcase */
  };
}

module.exports = EventPublisher;

},{"./request":12}],7:[function(require,module,exports){
'use strict';

/**
 * Heartbeat just wants you to call <code>beat()</code> every once in a while.
 *
 * <p>It initializes a countdown timer that expects a call to
 * <code>Hearbeat#beat</code> every n seconds. If <code>beat()</code> hasn't
 * been called for <code>#interval</code> seconds, it emits a
 * <code>onsleep</code> event and waits. The next call to <code>beat()</code>
 * emits <code>onwakeup</code> and initializes a new timer.</p>
 *
 * <p>For example:</p>
 *
 * @example
 *
 *     >>> hb = new Heartbeat({
 *     ...   interval: 10,
 *     ...   onsleep: function() { console.log('Gone to sleep...Zzz...'); },
 *     ...   onwakeup: function() { console.log('Awake already!'); },
 *     ... });
 *
 *     >>> hb.beat(); # then wait 10 seconds
 *     Gone to sleep...Zzz...
 *     >>> hb.beat();
 *     Awake already!
 *
 * @exports Heartbeat as Twilio.Heartbeat
 * @memberOf Twilio
 * @constructor
 * @param {object} opts Options for Heartbeat
 * @config {int} [interval=10] Seconds between each call to <code>beat</code>
 * @config {function} [onsleep] Callback for sleep events
 * @config {function} [onwakeup] Callback for wakeup events
 */
function Heartbeat(opts) {
  if (!(this instanceof Heartbeat)) return new Heartbeat(opts);
  opts = opts || {};
  function noop() { }
  var defaults = {
    interval: 10,
    now: function() { return new Date().getTime(); },
    repeat: function(f, t) { return setInterval(f, t); },
    stop: function(f, t) { return clearInterval(f, t); },
    onsleep: noop,
    onwakeup: noop
  };
  for (var prop in defaults) {
    if (prop in opts) continue;
    opts[prop] = defaults[prop];
  }
  /**
   * Number of seconds with no beat before sleeping.
   * @type number
   */
  this.interval = opts.interval;
  this.lastbeat = 0;
  this.pintvl = null;

  /**
   * Invoked when this object has not received a call to <code>#beat</code>
   * for an elapsed period of time greater than <code>#interval</code>
   * seconds.
   *
   * @event
   */
  this.onsleep = opts.onsleep;

  /**
   * Invoked when this object is sleeping and receives a call to
   * <code>#beat</code>.
   *
   * @event
   */
  this.onwakeup = opts.onwakeup;

  this.repeat = opts.repeat;
  this.stop = opts.stop;
  this.now = opts.now;
}

/**
 * @return {string}
 */
Heartbeat.toString = function() {
  return '[Twilio.Heartbeat class]';
};

/**
 * @return {string}
 */
Heartbeat.prototype.toString = function() {
  return '[Twilio.Heartbeat instance]';
};
/**
 * Keeps the instance awake (by resetting the count down); or if asleep,
 * wakes it up.
 */
Heartbeat.prototype.beat = function() {
  this.lastbeat = this.now();
  if (this.sleeping()) {
    if (this.onwakeup) {
      this.onwakeup();
    }
    var self = this;
    this.pintvl = this.repeat.call(
      null,
      function() { self.check(); },
      this.interval * 1000
    );
  }
};
/**
 * Goes into a sleep state if the time between now and the last heartbeat
 * is greater than or equal to the specified <code>interval</code>.
 */
Heartbeat.prototype.check = function() {
  var timeidle = this.now() - this.lastbeat;
  if (!this.sleeping() && timeidle >= this.interval * 1000) {
    if (this.onsleep) {
      this.onsleep();
    }
    this.stop.call(null, this.pintvl);

    this.pintvl = null;
  }
};
/**
 * @return {boolean} True if sleeping
 */
Heartbeat.prototype.sleeping = function() {
  return this.pintvl === null;
};
exports.Heartbeat = Heartbeat;

},{}],8:[function(require,module,exports){
'use strict';

/**
 * Bestow logging powers.
 *
 * @exports mixinLog as Twilio.mixinLog
 * @memberOf Twilio
 *
 * @param {object} object The object to bestow logging powers to
 * @param {string} [prefix] Prefix log messages with this
 *
 * @return {object} Return the object passed in
 */
function mixinLog(object, prefix) {
  /**
   * Logs a message or object.
   *
   * <p>There are a few options available for the log mixin. Imagine an object
   * <code>foo</code> with this function mixed in:</p>
   *
   * <pre><code>var foo = {};
   * Twilio.mixinLog(foo);
   *
   * </code></pre>
   *
   * <p>To enable or disable the log: <code>foo.log.enabled = true</code></p>
   *
   * <p>To modify the prefix: <code>foo.log.prefix = 'Hello'</code></p>
   *
   * <p>To use a custom callback instead of <code>console.log</code>:
   * <code>foo.log.handler = function() { ... };</code></p>
   *
   * @param *args Messages or objects to be logged
   */
  function log() {
    if (!log.enabled) {
      return;
    }
    var format = log.prefix ? log.prefix + ' ' : '';
    for (var i = 0; i < arguments.length; i++) {
      var arg = arguments[i];
      log.handler(
        typeof arg === 'string'
        ? format + arg
        : arg
      );
    }
  }

  function defaultWarnHandler(x) {
    /* eslint-disable no-console */
    if (typeof console !== 'undefined') {
      if (typeof console.warn === 'function') {
        console.warn(x);
      } else if (typeof console.log === 'function') {
        console.log(x);
      }
    }
    /* eslint-enable no-console */
  }

  function deprecated() {
    if (!log.warnings) {
      return;
    }
    for (var i = 0; i < arguments.length; i++) {
      var arg = arguments[i];
      log.warnHandler(arg);
    }
  }

  log.enabled = true;
  log.prefix = prefix || '';
  /** @ignore */
  log.defaultHandler = function(x) {
    // eslint-disable-next-line no-console
    if (typeof console !== 'undefined') { console.log(x); }
  };
  log.handler = log.defaultHandler;
  log.warnings = true;
  log.defaultWarnHandler = defaultWarnHandler;
  log.warnHandler = log.defaultWarnHandler;
  log.deprecated = deprecated;
  log.warn = deprecated;

  object.log = log;
}
exports.mixinLog = mixinLog;

},{}],9:[function(require,module,exports){
'use strict';

var Log = require('./log');
var SOUNDS_DEPRECATION_WARNING = require('./strings').SOUNDS_DEPRECATION_WARNING;

exports.Options = (function() {
  function Options(defaults, assignments) {
    if (!(this instanceof Options)) {
      return new Options(defaults);
    }
    this.__dict__ = {};
    defaults = defaults || {};
    assignments = assignments || {};
    Log.mixinLog(this, '[Sounds]');

    var hasBeenWarned = false;
    function makeprop(__dict__, name, log) {
      return function(value, shouldSilence) {
        if (!shouldSilence && !hasBeenWarned) {
          hasBeenWarned = true;
          log.deprecated(SOUNDS_DEPRECATION_WARNING);
        }

        if (typeof value !== 'undefined') {
          __dict__[name] = value;
        }

        return __dict__[name];
      };
    }

    var name;
    for (name in defaults) {
      this[name] = makeprop(this.__dict__, name, this.log);
      this[name](defaults[name], true);
    }
    for (name in assignments) {
      this[name](assignments[name], true);
    }
  }

  return Options;
})();

},{"./log":8,"./strings":26}],10:[function(require,module,exports){
'use strict';

var util = require('./util');
var DEFAULT_TEST_SOUND_URL = util.getTwilioRoot()
  + 'sounds/releases/' + util.getSoundVersion() + '/outgoing.mp3';

/**
 * A smart collection containing a Set of active output devices.
 * @class
 * @private
 * @param {string} name - The name of this collection of devices. This will be returned
 *   with beforeChange.
 * @param {Map<string deviceId, MediaDeviceInfo device>} A Map of the available devices
 *   to search within for getting and setting devices. This Map may change externally.
 * @param {OutputDeviceCollection~beforeChange} beforeChange
 * @param {Boolean} isSupported - Whether or not this class is supported. If false,
 *   functionality will be replaced with console warnings.
 *//**
 * A callback to run before updating the collection after active devices are changed
 *   via the public API. If this returns a Promise, the list of active devices will
 *   not be updated until it is resolved.
 * @callback OutputDeviceCollection~beforeChange
 * @param {string} name - Name of the collection.
 * @param {Array<MediaDeviceInfo>} devices - A list of MediaDeviceInfos representing the
 *   now active set of devices.
 */
function OutputDeviceCollection(name, availableDevices, beforeChange, isSupported) {
  Object.defineProperties(this, {
    _activeDevices: { value: new Set() },
    _availableDevices: { value: availableDevices },
    _beforeChange: { value: beforeChange },
    _isSupported: { value: isSupported },
    _name: { value: name }
  });
}

/**
 * Delete a device from the collection. If no devices remain, the 'default'
 *   device will be added as the sole device. If no `default` device exists,
 *   the first available device will be used.
 * @private
 * @returns {Boolean} wasDeleted
 */
OutputDeviceCollection.prototype._delete = function _delete(device) {
  var wasDeleted = this._activeDevices.delete(device);

  var defaultDevice = this._availableDevices.get('default')
    || Array.from(this._availableDevices.values())[0];

  if (!this._activeDevices.size && defaultDevice) {
    this._activeDevices.add(defaultDevice);
  }

  // Call _beforeChange so that the implementation can react when a device is
  // removed or lost.
  var deviceIds = Array.from(this._activeDevices).map(function(deviceInfo) {
    return deviceInfo.deviceId;
  });

  this._beforeChange(this._name, deviceIds);
  return wasDeleted;
};

/**
 * Get the current set of devices.
 * @returns {Set<MediaDeviceInfo>}
 */
OutputDeviceCollection.prototype.get = function get() {
  return this._activeDevices;
};

/**
 * Replace the current set of devices with a new set of devices.
 * @param {string|Array<string>} deviceIds - An ID or array of IDs
 *   of devices to replace the existing devices with.
 * @returns {Promise} - Rejects if this feature is not supported, any of the
 *    supplied IDs are not found, or no IDs are passed.
 */
OutputDeviceCollection.prototype.set = function set(deviceIds) {
  if (!this._isSupported) {
    return Promise.reject(new Error('This browser does not support audio output selection'));
  }

  deviceIds = Array.isArray(deviceIds) ? deviceIds : [deviceIds];

  if (!deviceIds.length) {
    return Promise.reject(new Error('Must specify at least one device to set'));
  }

  var missingIds = [];
  var devices = deviceIds.map(function(id) {
    var device = this._availableDevices.get(id);
    if (!device) { missingIds.push(id); }
    return device;
  }, this);

  if (missingIds.length) {
    return Promise.reject(new Error('Devices not found: ' + missingIds.join(', ')));
  }

  var self = this;
  function updateDevices() {
    self._activeDevices.clear();
    devices.forEach(self._activeDevices.add, self._activeDevices);
  }

  return new Promise(function(resolve) {
    resolve(self._beforeChange(self._name, deviceIds));
  }).then(updateDevices);
};

/**
 * Test the devices by playing audio through them.
 * @param {?string} [soundUrl] - An optional URL. If none is specified, we will
 *   play a default test tone.
 * @returns {Promise} Succeeds if the underlying .play() methods' Promises succeed.
 */
OutputDeviceCollection.prototype.test = function test(soundUrl) {
  if (!this._isSupported) {
    return Promise.reject(new Error('This browser does not support audio output selection'));
  }

  soundUrl = soundUrl || DEFAULT_TEST_SOUND_URL;

  if (!this._activeDevices.size) {
    return Promise.reject(new Error('No active output devices to test'));
  }

  return Promise.all(Array.from(this._activeDevices).map(function(device) {
    var el = new Audio([soundUrl]);

    return el.setSinkId(device.deviceId).then(function() {
      return el.play();
    });
  }));
};

module.exports = OutputDeviceCollection;

},{"./util":27}],11:[function(require,module,exports){
'use strict';

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var log = require('./log');
var twutil = require('./util');

var WSTransport = require('./wstransport').WSTransport;

/**
 * Constructor for PStream objects.
 *
 * @exports PStream as Twilio.PStream
 * @memberOf Twilio
 * @borrows EventEmitter#addListener as #addListener
 * @borrows EventEmitter#removeListener as #removeListener
 * @borrows EventEmitter#emit as #emit
 * @borrows EventEmitter#hasListener as #hasListener
 * @constructor
 * @param {string} token The Twilio capabilities JWT
 * @param {object} [options]
 * @config {boolean} [options.debug=false] Enable debugging
 */
function PStream(token, options) {
  if (!(this instanceof PStream)) {
    return new PStream(token, options);
  }
  twutil.monitorEventEmitter('Twilio.PStream', this);
  var defaults = {
    logPrefix: '[PStream]',
    chunderw: 'chunderw-vpc-gll.twilio.com',
    secureSignaling: true,
    transportFactory: WSTransport,
    debug: false
  };
  options = options || {};
  for (var prop in defaults) {
    if (prop in options) continue;
    options[prop] = defaults[prop];
  }
  this.options = options;
  this.token = token || '';
  this.status = 'disconnected';
  this.host = this.options.chunderw;
  this.gateway = null;
  this.region = null;

  log.mixinLog(this, this.options.logPrefix);
  this.log.enabled = this.options.debug;

  // NOTE(mroberts): EventEmitter requires that we catch all errors.
  this.on('error', function() { });

  /*
   *events used by device
   *'invite',
   *'ready',
   *'error',
   *'offline',
   *
   *'cancel',
   *'presence',
   *'roster',
   *'answer',
   *'candidate',
   *'hangup'
   */

  var self = this;

  this.addListener('ready', function() {
    self.status = 'ready';
  });
  this.addListener('offline', function() {
    self.status = 'offline';
  });
  this.addListener('close', function() {
    self.destroy();
  });

  var opt = {
    host: this.host,
    debug: this.options.debug,
    secureSignaling: this.options.secureSignaling
  };
  this.transport = this.options.transportFactory(opt);
  this.transport.onopen = function() {
    self.status = 'connected';
    self.setToken(self.token);
  };
  this.transport.onclose = function() {
    if (self.status !== 'disconnected') {
      if (self.status !== 'offline') {
        self.emit('offline', self);
      }
      self.status = 'disconnected';
    }
  };
  this.transport.onerror = function(err) {
    self.emit('error', err);
  };
  this.transport.onmessage = function(msg) {
    var objects = twutil.splitObjects(msg.data);
    for (var i = 0; i < objects.length; i++) {
      var obj = JSON.parse(objects[i]);
      var eventType = obj.type;
      var payload = obj.payload || {};

      if (payload.gateway) {
        self.gateway = payload.gateway;
      }

      if (payload.region) {
        self.region = payload.region;
      }

      // emit event type and pass the payload
      self.emit(eventType, payload);
    }
  };
  this.transport.open();

  return this;
}

util.inherits(PStream, EventEmitter);

/**
 * @return {string}
 */
PStream.toString = function() {
  return '[Twilio.PStream class]';
};

PStream.prototype.toString = function() {
  return '[Twilio.PStream instance]';
};
PStream.prototype.setToken = function(token) {
  this.log('Setting token and publishing listen');
  this.token = token;
  var payload = {
    token: token,
    browserinfo: twutil.getSystemInfo()
  };
  this.publish('listen', payload);
};
PStream.prototype.register = function(mediaCapabilities) {
  var regPayload = {
    media: mediaCapabilities
  };
  this.publish('register', regPayload);
};
PStream.prototype.destroy = function() {
  this.log('Closing PStream');
  this.transport.close();
  return this;
};
PStream.prototype.publish = function(type, payload) {
  var msg = JSON.stringify({
    type: type,
    version: twutil.getPStreamVersion(),
    payload: payload
  });
  this.transport.send(msg);
};

exports.PStream = PStream;

},{"./log":8,"./util":27,"./wstransport":28,"events":34,"util":49}],12:[function(require,module,exports){
'use strict';

var XHR = typeof XMLHttpRequest === 'undefined'
  ? require('xmlhttprequest').XMLHttpRequest
  /* istanbul ignore next: external dependency */
  : XMLHttpRequest;

function request(method, params, callback) {
  var options = {};
  options.XMLHttpRequest = options.XMLHttpRequest || XHR;
  var xhr = new options.XMLHttpRequest();

  xhr.open(method, params.url, true);
  xhr.onreadystatechange = function onreadystatechange() {
    if (xhr.readyState !== 4) { return; }

    if (200 <= xhr.status && xhr.status < 300) {
      callback(null, xhr.responseText);
      return;
    }

    callback(new Error(xhr.responseText));
  };

  for (var headerName in params.headers) {
    xhr.setRequestHeader(headerName, params.headers[headerName]);
  }

  xhr.send(JSON.stringify(params.body));
}
/**
 * Use XMLHttpRequest to get a network resource.
 * @param {String} method - HTTP Method
 * @param {Object} params - Request parameters
 * @param {String} params.url - URL of the resource
 * @param {Array}  params.headers - An array of headers to pass [{ headerName : headerBody }]
 * @param {Object} params.body - A JSON body to send to the resource
 * @returns {response}
 **/
var Request = request;

/**
 * Sugar function for request('GET', params, callback);
 * @param {Object} params - Request parameters
 * @param {Request~get} callback - The callback that handles the response.
 */
Request.get = function get(params, callback) {
  return new this('GET', params, callback);
};

/**
 * Sugar function for request('POST', params, callback);
 * @param {Object} params - Request parameters
 * @param {Request~post} callback - The callback that handles the response.
 */
Request.post = function post(params, callback) {
  return new this('POST', params, callback);
};

module.exports = Request;

},{"xmlhttprequest":50}],13:[function(require,module,exports){
'use strict';

var util = require('../util');

function getUserMedia(constraints, options) {
  options = options || {};
  options.util = options.util || util;
  options.navigator = options.navigator
    || (typeof navigator !== 'undefined' ? navigator : null);

  return new Promise(function(resolve, reject) {
    if (!options.navigator) {
      throw new Error('getUserMedia is not supported');
    }

    switch ('function') {
      case typeof (options.navigator.mediaDevices && options.navigator.mediaDevices.getUserMedia):
        return resolve(options.navigator.mediaDevices.getUserMedia(constraints));
      case typeof options.navigator.webkitGetUserMedia:
        return options.navigator.webkitGetUserMedia(constraints, resolve, reject);
      case typeof options.navigator.mozGetUserMedia:
        return options.navigator.mozGetUserMedia(constraints, resolve, reject);
      case typeof options.navigator.getUserMedia:
        return options.navigator.getUserMedia(constraints, resolve, reject);
      default:
        throw new Error('getUserMedia is not supported');
    }
  }).catch(function(e) {
    throw (options.util.isFirefox() && e.name === 'NotReadableError')
      ? new Error('Firefox does not currently support opening multiple audio input tracks' +
        'simultaneously, even across different tabs.\n' +
        'Related Bugzilla thread: https://bugzilla.mozilla.org/show_bug.cgi?id=1299324')
      : e;
  });
}

module.exports = getUserMedia;

},{"../util":27}],14:[function(require,module,exports){
'use strict';

var PeerConnection = require('./peerconnection');

function enabled(set) {
  if (typeof set !== 'undefined') {
    PeerConnection.enabled = set;
  }
  return PeerConnection.enabled;
}

function getMediaEngine() {
  return typeof RTCIceGatherer !== 'undefined' ? 'ORTC' : 'WebRTC';
}

module.exports = {
  enabled: enabled,
  getMediaEngine: getMediaEngine,
  PeerConnection: PeerConnection
};

},{"./peerconnection":18}],15:[function(require,module,exports){
/**
 * This file was imported from another project. If making changes to this file, please don't
 * make them here. Make them on the linked repo below, then copy back:
 * https://code.hq.twilio.com/client/MockRTCStatsReport
 */

/* eslint-disable no-undefined */
'use strict';

// The legacy max volume, which is the positive half of a signed short integer.
var OLD_MAX_VOLUME = 32767;

var NativeRTCStatsReport = typeof window !== 'undefined'
  ? window.RTCStatsReport : undefined;

/**
 * Create a MockRTCStatsReport wrapper around a Map of RTCStats objects. If RTCStatsReport is available
 *   natively, it will be inherited so that instanceof checks pass.
 * @constructor
 * @extends RTCStatsReport
 * @param {Map<string, RTCStats>} statsMap - A Map of RTCStats objects to wrap
 *   with a MockRTCStatsReport object.
 */
function MockRTCStatsReport(statsMap) {
  if (!(this instanceof MockRTCStatsReport)) {
    return new MockRTCStatsReport(statsMap);
  }

  var self = this;
  Object.defineProperties(this, {
    size: {
      enumerable: true,
      get: function() {
        return self._map.size;
      }
    },
    _map: { value: statsMap }
  });

  this[Symbol.iterator] = statsMap[Symbol.iterator];
}

// If RTCStatsReport is available natively, inherit it. Keep our constructor.
if (NativeRTCStatsReport) {
  MockRTCStatsReport.prototype = Object.create(NativeRTCStatsReport.prototype);
  MockRTCStatsReport.prototype.constructor = MockRTCStatsReport;
}

// Map the Map-like read methods to the underlying Map
['entries', 'forEach', 'get', 'has', 'keys', 'values'].forEach(function(key) {
  MockRTCStatsReport.prototype[key] = function() {
    return this._map[key].apply(this._map, arguments);
  };
});

/**
 * Convert an array of RTCStats objects into a mock RTCStatsReport object.
 * @param {Array<RTCStats>}
 * @return {MockRTCStatsReport}
 */
MockRTCStatsReport.fromArray = function fromArray(array) {
  return new MockRTCStatsReport(array.reduce(function(map, rtcStats) {
    map.set(rtcStats.id, rtcStats);
    return map;
  }, new Map()));
};

/**
 * Convert a legacy RTCStatsResponse object into a mock RTCStatsReport object.
 * @param {RTCStatsResponse} statsResponse - An RTCStatsResponse object returned by the
 *   legacy getStats(callback) method in Chrome.
 * @return {MockRTCStatsReport} A mock RTCStatsReport object.
 */
MockRTCStatsReport.fromRTCStatsResponse = function fromRTCStatsResponse(statsResponse) {
  var activeCandidatePairId;
  var transportIds = new Map();

  var statsMap = statsResponse.result().reduce(function(statsMap, report) {
    var id = report.id;
    switch (report.type) {
      case 'googCertificate':
        statsMap.set(id, createRTCCertificateStats(report));
        break;
      case 'datachannel':
        statsMap.set(id, createRTCDataChannelStats(report));
        break;
      case 'googCandidatePair':
        if (getBoolean(report, 'googActiveConnection')) {
          activeCandidatePairId = id;
        }

        statsMap.set(id, createRTCIceCandidatePairStats(report));
        break;
      case 'localcandidate':
        statsMap.set(id, createRTCIceCandidateStats(report, false));
        break;
      case 'remotecandidate':
        statsMap.set(id, createRTCIceCandidateStats(report, true));
        break;
      case 'ssrc':
        if (isPresent(report, 'packetsReceived')) {
          statsMap.set('rtp-' + id, createRTCInboundRTPStreamStats(report));
        } else {
          statsMap.set('rtp-' + id, createRTCOutboundRTPStreamStats(report));
        }

        statsMap.set('track-' + id, createRTCMediaStreamTrackStats(report));
        statsMap.set('codec-' + id, createRTCCodecStats(report));
        break;
      case 'googComponent':
        var transportReport = createRTCTransportStats(report);
        transportIds.set(transportReport.selectedCandidatePairId, id);
        statsMap.set(id, createRTCTransportStats(report));
        break;
    }

    return statsMap;
  }, new Map());

  if (activeCandidatePairId) {
    var activeTransportId = transportIds.get(activeCandidatePairId);
    if (activeTransportId) {
      statsMap.get(activeTransportId).dtlsState = 'connected';
    }
  }

  return new MockRTCStatsReport(statsMap);
};

/**
 * @param {RTCLegacyStatsReport} report
 * @returns {RTCTransportStats}
 */
function createRTCTransportStats(report) {
  return {
    type: 'transport',
    id: report.id,
    timestamp: Date.parse(report.timestamp),
    bytesSent: undefined,
    bytesReceived: undefined,
    rtcpTransportStatsId: undefined,
    dtlsState: undefined,
    selectedCandidatePairId: report.stat('selectedCandidatePairId'),
    localCertificateId: report.stat('localCertificateId'),
    remoteCertificateId: report.stat('remoteCertificateId')
  };
}

/**
 * @param {RTCLegacyStatsReport} report
 * @returns {RTCCodecStats}
 */
function createRTCCodecStats(report) {
  return {
    type: 'codec',
    id: report.id,
    timestamp: Date.parse(report.timestamp),
    payloadType: undefined,
    mimeType: report.stat('mediaType') + '/' + report.stat('googCodecName'),
    clockRate: undefined,
    channels: undefined,
    sdpFmtpLine: undefined,
    implementation: undefined
  };
}

/**
 * @param {RTCLegacyStatsReport} report
 * @returns {RTCMediaStreamTrackStats}
 */
function createRTCMediaStreamTrackStats(report) {
  return {
    type: 'track',
    id: report.id,
    timestamp: Date.parse(report.timestamp),
    trackIdentifier: report.stat('googTrackId'),
    remoteSource: undefined,
    ended: undefined,
    kind: report.stat('mediaType'),
    detached: undefined,
    ssrcIds: undefined,
    frameWidth: isPresent(report, 'googFrameWidthReceived')
      ? getInt(report, 'googFrameWidthReceived')
      : getInt(report, 'googFrameWidthSent'),
    frameHeight: isPresent(report, 'googFrameHeightReceived')
      ? getInt(report, 'googFrameHeightReceived')
      : getInt(report, 'googFrameHeightSent'),
    framesPerSecond: undefined,
    framesSent: getInt(report, 'framesEncoded'),
    framesReceived: undefined,
    framesDecoded: getInt(report, 'framesDecoded'),
    framesDropped: undefined,
    framesCorrupted: undefined,
    partialFramesLost: undefined,
    fullFramesLost: undefined,
    audioLevel: isPresent(report, 'audioOutputLevel')
      ? getInt(report, 'audioOutputLevel') / OLD_MAX_VOLUME
      : (getInt(report, 'audioInputLevel') || 0) / OLD_MAX_VOLUME,
    echoReturnLoss: getFloat(report, 'googEchoCancellationReturnLoss'),
    echoReturnLossEnhancement: getFloat(report, 'googEchoCancellationReturnLossEnhancement')
  };
}

/**
 * @param {RTCLegacyStatsReport} report
 * @param {boolean} isInbound - Whether to create an inbound stats object, or outbound.
 * @returns {RTCRTPStreamStats}
 */
function createRTCRTPStreamStats(report, isInbound) {
  return {
    id: report.id,
    timestamp: Date.parse(report.timestamp),
    ssrc: report.stat('ssrc'),
    associateStatsId: undefined,
    isRemote: undefined,
    mediaType: report.stat('mediaType'),
    trackId: 'track-' + report.id,
    transportId: report.stat('transportId'),
    codecId: 'codec-' + report.id,
    firCount: isInbound
      ? getInt(report, 'googFirsSent')
      : undefined,
    pliCount: isInbound
      ? getInt(report, 'googPlisSent')
      : getInt(report, 'googPlisReceived'),
    nackCount: isInbound
      ? getInt(report, 'googNacksSent')
      : getInt(report, 'googNacksReceived'),
    sliCount: undefined,
    qpSum: getInt(report, 'qpSum')
  };
}

/**
 * @param {RTCLegacyStatsReport} report
 * @returns {RTCInboundRTPStreamStats}
 */
function createRTCInboundRTPStreamStats(report) {
  var rtp = createRTCRTPStreamStats(report, true);

  Object.assign(rtp, {
    type: 'inbound-rtp',
    packetsReceived: getInt(report, 'packetsReceived'),
    bytesReceived: getInt(report, 'bytesReceived'),
    packetsLost: getInt(report, 'packetsLost'),
    jitter: convertMsToSeconds(report.stat('googJitterReceived')),
    fractionLost: undefined,
    roundTripTime: convertMsToSeconds(report.stat('googRtt')),
    packetsDiscarded: undefined,
    packetsRepaired: undefined,
    burstPacketsLost: undefined,
    burstPacketsDiscarded: undefined,
    burstLossCount: undefined,
    burstDiscardCount: undefined,
    burstLossRate: undefined,
    burstDiscardRate: undefined,
    gapLossRate: undefined,
    gapDiscardRate: undefined,
    framesDecoded: getInt(report, 'framesDecoded')
  });

  return rtp;
}

/**
 * @param {RTCLegacyStatsReport} report
 * @returns {RTCOutboundRTPStreamStats}
 */
function createRTCOutboundRTPStreamStats(report) {
  var rtp = createRTCRTPStreamStats(report, false);

  Object.assign(rtp, {
    type: 'outbound-rtp',
    remoteTimestamp: undefined,
    packetsSent: getInt(report, 'packetsSent'),
    bytesSent: getInt(report, 'bytesSent'),
    targetBitrate: undefined,
    framesEncoded: getInt(report, 'framesEncoded')
  });

  return rtp;
}

/**
 * @param {RTCLegacyStatsReport} report
 * @param {boolean} isRemote - Whether to create for a remote candidate, or local candidate.
 * @returns {RTCIceCandidateStats}
 */
function createRTCIceCandidateStats(report, isRemote) {
  return {
    type: isRemote
      ? 'remote-candidate'
      : 'local-candidate',
    id: report.id,
    timestamp: Date.parse(report.timestamp),
    transportId: undefined,
    isRemote: isRemote,
    ip: report.stat('ipAddress'),
    port: getInt(report, 'portNumber'),
    protocol: report.stat('transport'),
    candidateType: translateCandidateType(report.stat('candidateType')),
    priority: getFloat(report, 'priority'),
    url: undefined,
    relayProtocol: undefined,
    deleted: undefined
  };
}

/**
 * @param {RTCLegacyStatsReport} report
 * @returns {RTCIceCandidatePairStats}
 */
function createRTCIceCandidatePairStats(report) {
  return {
    type: 'candidate-pair',
    id: report.id,
    timestamp: Date.parse(report.timestamp),
    transportId: report.stat('googChannelId'),
    localCandidateId: report.stat('localCandidateId'),
    remoteCandidateId: report.stat('remoteCandidateId'),
    state: undefined,
    priority: undefined,
    nominated: undefined,
    writable: getBoolean(report, 'googWritable'),
    readable: undefined,
    bytesSent: getInt(report, 'bytesSent'),
    bytesReceived: getInt(report, 'bytesReceived'),
    lastPacketSentTimestamp: undefined,
    lastPacketReceivedTimestamp: undefined,
    totalRoundTripTime: undefined,
    currentRoundTripTime: convertMsToSeconds(report.stat('googRtt')),
    availableOutgoingBitrate: undefined,
    availableIncomingBitrate: undefined,
    requestsReceived: getInt(report, 'requestsReceived'),
    requestsSent: getInt(report, 'requestsSent'),
    responsesReceived: getInt(report, 'responsesReceived'),
    responsesSent: getInt(report, 'responsesSent'),
    retransmissionsReceived: undefined,
    retransmissionsSent: undefined,
    consentRequestsSent: getInt(report, 'consentRequestsSent')
  };
}

/**
 * @param {RTCLegacyStatsReport} report
 * @returns {RTCIceCertificateStats}
 */
function createRTCCertificateStats(report) {
  return {
    type: 'certificate',
    id: report.id,
    timestamp: Date.parse(report.timestamp),
    fingerprint: report.stat('googFingerprint'),
    fingerprintAlgorithm: report.stat('googFingerprintAlgorithm'),
    base64Certificate: report.stat('googDerBase64'),
    issuerCertificateId: report.stat('googIssuerId')
  };
}

/**
 * @param {RTCLegacyStatsReport} report
 * @returns {RTCDataChannelStats}
 */
function createRTCDataChannelStats(report) {
  return {
    type: 'data-channel',
    id: report.id,
    timestamp: Date.parse(report.timestamp),
    label: report.stat('label'),
    protocol: report.stat('protocol'),
    datachannelid: report.stat('datachannelid'),
    transportId: report.stat('transportId'),
    state: report.stat('state'),
    messagesSent: undefined,
    bytesSent: undefined,
    messagesReceived: undefined,
    bytesReceived: undefined
  };
}

/**
 * @param {number} inMs - A time in milliseconds
 * @returns {number} The time in seconds
 */
function convertMsToSeconds(inMs) {
  return isNaN(inMs) || inMs === ''
    ? undefined
    : parseInt(inMs, 10) / 1000;
}

/**
 * @param {string} type - A type in the legacy format
 * @returns {string} The type adjusted to new standards for known naming changes
 */
function translateCandidateType(type) {
  switch (type) {
    case 'peerreflexive':
      return 'prflx';
    case 'serverreflexive':
      return 'srflx';
    case 'host':
    case 'relay':
    default:
      return type;
  }
}

function getInt(report, statName) {
  var stat = report.stat(statName);
  return isPresent(report, statName)
    ? parseInt(stat, 10)
    : undefined;
}

function getFloat(report, statName) {
  var stat = report.stat(statName);
  return isPresent(report, statName)
    ? parseFloat(stat)
    : undefined;
}

function getBoolean(report, statName) {
  var stat = report.stat(statName);
  return isPresent(report, statName)
    ? (stat === 'true' || stat === true)
    : undefined;
}

function isPresent(report, statName) {
  var stat = report.stat(statName);
  return typeof stat !== 'undefined' && stat !== '';
}

module.exports = MockRTCStatsReport;

},{}],16:[function(require,module,exports){
'use strict';

var EventEmitter = require('events').EventEmitter;
var getStatistics = require('./stats');
var inherits = require('util').inherits;
var Mos = require('./mos');

// How many samples we use when testing metric thresholds
var SAMPLE_COUNT_METRICS = 5;

// How many samples that need to cross the threshold to
// raise or clear a warning.
var SAMPLE_COUNT_CLEAR = 0;
var SAMPLE_COUNT_RAISE = 3;

var SAMPLE_INTERVAL = 1000;
var WARNING_TIMEOUT = 5 * 1000;

/**
 * @typedef {Object} RTCMonitor.ThresholdOptions
 * @property {RTCMonitor.ThresholdOption} [audioInputLevel] - Rules to apply to sample.audioInputLevel
 * @property {RTCMonitor.ThresholdOption} [audioOutputLevel] - Rules to apply to sample.audioOutputLevel
 * @property {RTCMonitor.ThresholdOption} [packetsLostFraction] - Rules to apply to sample.packetsLostFraction
 * @property {RTCMonitor.ThresholdOption} [jitter] - Rules to apply to sample.jitter
 * @property {RTCMonitor.ThresholdOption} [rtt] - Rules to apply to sample.rtt
 * @property {RTCMonitor.ThresholdOption} [mos] - Rules to apply to sample.mos
 *//**
 * @typedef {Object} RTCMonitor.ThresholdOption
 * @property {?Number} [min] - Warning will be raised if tracked metric falls below this value.
 * @property {?Number} [max] - Warning will be raised if tracked metric rises above this value.
 * @property {?Number} [maxDuration] - Warning will be raised if tracked metric stays constant for
 *   the specified number of consequent samples.
 */
var DEFAULT_THRESHOLDS = {
  audioInputLevel: { maxDuration: 10 },
  audioOutputLevel: { maxDuration: 10 },
  packetsLostFraction: { max: 1 },
  jitter: { max: 30 },
  rtt: { max: 400 },
  mos: { min: 3 }
};

/**
 * RTCMonitor polls a peerConnection via PeerConnection.getStats
 * and emits warnings when stats cross the specified threshold values.
 * @constructor
 * @param {RTCMonitor.Options} [options] - Config options for RTCMonitor.
 *//**
 * @typedef {Object} RTCMonitor.Options
 * @property {PeerConnection} [peerConnection] - The PeerConnection to monitor.
 * @property {RTCMonitor.ThresholdOptions} [thresholds] - Optional custom threshold values.
 */
function RTCMonitor(options) {
  if (!(this instanceof RTCMonitor)) {
    return new RTCMonitor(options);
  }

  options = options || { };
  var thresholds = Object.assign({ }, DEFAULT_THRESHOLDS, options.thresholds);

  Object.defineProperties(this, {
    _activeWarnings: { value: new Map() },
    _currentStreaks: { value: new Map() },
    _peerConnection: { value: options.peerConnection, writable: true },
    _sampleBuffer: { value: [] },
    _sampleInterval: { value: null, writable: true },
    _thresholds: { value: thresholds },
    _warningsEnabled: { value: true, writable: true }
  });

  if (options.peerConnection) {
    this.enable();
  }

  EventEmitter.call(this);
}

inherits(RTCMonitor, EventEmitter);

/**
 * Create a sample object from a stats object using the previous sample,
 *   if available.
 * @param {Object} stats - Stats retrieved from getStatistics
 * @param {?Object} [previousSample=null] - The previous sample to use to calculate deltas.
 * @returns {Promise<RTCSample>}
 */
RTCMonitor.createSample = function createSample(stats, previousSample) {
  var previousPacketsSent = previousSample && previousSample.totals.packetsSent || 0;
  var previousPacketsReceived = previousSample && previousSample.totals.packetsReceived || 0;
  var previousPacketsLost = previousSample && previousSample.totals.packetsLost || 0;

  var currentPacketsSent = stats.packetsSent - previousPacketsSent;
  var currentPacketsReceived = stats.packetsReceived - previousPacketsReceived;
  var currentPacketsLost = stats.packetsLost - previousPacketsLost;
  var currentInboundPackets = currentPacketsReceived + currentPacketsLost;
  var currentPacketsLostFraction = (currentInboundPackets > 0) ?
    (currentPacketsLost / currentInboundPackets) * 100 : 0;

  var totalInboundPackets = stats.packetsReceived + stats.packetsLost;
  var totalPacketsLostFraction = (totalInboundPackets > 0) ?
    (stats.packetsLost / totalInboundPackets) * 100 : 100;

  return {
    timestamp: stats.timestamp,
    totals: {
      packetsReceived: stats.packetsReceived,
      packetsLost: stats.packetsLost,
      packetsSent: stats.packetsSent,
      packetsLostFraction: totalPacketsLostFraction,
      bytesReceived: stats.bytesReceived,
      bytesSent: stats.bytesSent
    },
    packetsSent: currentPacketsSent,
    packetsReceived: currentPacketsReceived,
    packetsLost: currentPacketsLost,
    packetsLostFraction: currentPacketsLostFraction,
    audioInputLevel: stats.audioInputLevel,
    audioOutputLevel: stats.audioOutputLevel,
    jitter: stats.jitter,
    rtt: stats.rtt,
    mos: Mos.calculate(stats, previousSample && currentPacketsLostFraction)
  };
};

/**
 * Start sampling RTC statistics for this {@link RTCMonitor}.
 * @param {PeerConnection} [peerConnection] - A PeerConnection to monitor.
 * @throws {Error} Attempted to replace an existing PeerConnection in RTCMonitor.enable
 * @throws {Error} Can not enable RTCMonitor without a PeerConnection
 * @returns {RTCMonitor} This RTCMonitor instance.
 */
RTCMonitor.prototype.enable = function enable(peerConnection) {
  if (peerConnection) {
    if (this._peerConnection && peerConnection !== this._peerConnection) {
      throw new Error('Attempted to replace an existing PeerConnection in RTCMonitor.enable');
    }

    this._peerConnection = peerConnection;
  }

  if (!this._peerConnection) {
    throw new Error('Can not enable RTCMonitor without a PeerConnection');
  }

  this._sampleInterval = this._sampleInterval ||
    setInterval(this._fetchSample.bind(this), SAMPLE_INTERVAL);

  return this;
};

/**
 * Stop sampling RTC statistics for this {@link RTCMonitor}.
 * @returns {RTCMonitor} This RTCMonitor instance.
 */
RTCMonitor.prototype.disable = function disable() {
  clearInterval(this._sampleInterval);
  this._sampleInterval = null;

  return this;
};

/**
 * Get stats from the PeerConnection.
 * @returns {Promise<RTCSample>} A universally-formatted version of RTC stats.
 */
RTCMonitor.prototype.getSample = function getSample() {
  var pc = this._peerConnection;
  var self = this;

  return getStatistics(pc).then(function(stats) {
    var previousSample = self._sampleBuffer.length &&
      self._sampleBuffer[self._sampleBuffer.length - 1];

    return RTCMonitor.createSample(stats, previousSample);
  });
};

/**
 * Get stats from the PeerConnection and add it to our list of samples.
 * @private
 * @returns {Promise<Object>} A universally-formatted version of RTC stats.
 */
RTCMonitor.prototype._fetchSample = function _fetchSample() {
  var self = this;

  return this.getSample().then(
    function addSample(sample) {
      self._addSample(sample);
      self._raiseWarnings();
      self.emit('sample', sample);
      return sample;
    },
    function getSampleFailed(error) {
      self.disable();
      self.emit('error', error);
    }
  );
};

/**
 * Add a sample to our sample buffer and remove the oldest if
 *   we are over the limit.
 * @private
 * @param {Object} sample - Sample to add
 */
RTCMonitor.prototype._addSample = function _addSample(sample) {
  var samples = this._sampleBuffer;
  samples.push(sample);

  // We store 1 extra sample so that we always have (current, previous)
  // available for all {sampleBufferSize} threshold validations.
  if (samples.length > SAMPLE_COUNT_METRICS) {
    samples.splice(0, samples.length - SAMPLE_COUNT_METRICS);
  }
};

/**
 * Apply our thresholds to our array of RTCStat samples.
 * @private
 */
RTCMonitor.prototype._raiseWarnings = function _raiseWarnings() {
  if (!this._warningsEnabled) { return; }

  for (var name in this._thresholds) {
    this._raiseWarningsForStat(name);
  }
};

/**
 * Enable warning functionality.
 * @returns {RTCMonitor}
 */
RTCMonitor.prototype.enableWarnings = function enableWarnings() {
  this._warningsEnabled = true;
  return this;
};

/**
 * Disable warning functionality.
 * @returns {RTCMonitor}
 */
RTCMonitor.prototype.disableWarnings = function disableWarnings() {
  if (this._warningsEnabled) {
    this._activeWarnings.clear();
  }

  this._warningsEnabled = false;
  return this;
};

/**
 * Apply thresholds for a given stat name to our array of
 *   RTCStat samples and raise or clear any associated warnings.
 * @private
 * @param {String} statName - Name of the stat to compare.
 */
RTCMonitor.prototype._raiseWarningsForStat = function _raiseWarningsForStat(statName) {
  var samples = this._sampleBuffer;
  var limits = this._thresholds[statName];

  var relevantSamples = samples.slice(-SAMPLE_COUNT_METRICS);
  var values = relevantSamples.map(function(sample) {
    return sample[statName];
  });

  // (rrowland) If we have a bad or missing value in the set, we don't
  // have enough information to throw or clear a warning. Bail out.
  var containsNull = values.some(function(value) {
    return typeof value === 'undefined' || value === null;
  });

  if (containsNull) {
    return;
  }

  var count;
  if (typeof limits.max === 'number') {
    count = countHigh(limits.max, values);
    if (count >= SAMPLE_COUNT_RAISE) {
      this._raiseWarning(statName, 'max', { values: values });
    } else if (count <= SAMPLE_COUNT_CLEAR) {
      this._clearWarning(statName, 'max', { values: values });
    }
  }

  if (typeof limits.min === 'number') {
    count = countLow(limits.min, values);
    if (count >= SAMPLE_COUNT_RAISE) {
      this._raiseWarning(statName, 'min', { values: values });
    } else if (count <= SAMPLE_COUNT_CLEAR) {
      this._clearWarning(statName, 'min', { values: values });
    }
  }

  if (typeof limits.maxDuration === 'number' && samples.length > 1) {
    relevantSamples = samples.slice(-2);
    var prevValue = relevantSamples[0][statName];
    var curValue = relevantSamples[1][statName];

    var prevStreak = this._currentStreaks.get(statName) || 0;
    var streak = (prevValue === curValue) ? prevStreak + 1 : 0;

    this._currentStreaks.set(statName, streak);

    if (streak >= limits.maxDuration) {
      this._raiseWarning(statName, 'maxDuration', { value: streak });
    } else if (streak === 0) {
      this._clearWarning(statName, 'maxDuration', { value: prevStreak });
    }
  }
};

/**
 * Count the number of values that cross the min threshold.
 * @private
 * @param {Number} min - The minimum allowable value.
 * @param {Array<Number>} values - The values to iterate over.
 * @returns {Number} The amount of values in which the stat
 *   crossed the threshold.
 */
function countLow(min, values) {
  return values.reduce(function(lowCount, value) {
    // eslint-disable-next-line no-return-assign
    return lowCount += (value < min) ? 1 : 0;
  }, 0);
}

/**
 * Count the number of values that cross the max threshold.
 * @private
 * @param {Number} max - The max allowable value.
 * @param {Array<Number>} values - The values to iterate over.
 * @returns {Number} The amount of values in which the stat
 *   crossed the threshold.
 */
function countHigh(max, values) {
  return values.reduce(function(highCount, value) {
    // eslint-disable-next-line no-return-assign
    return highCount += (value > max) ? 1 : 0;
  }, 0);
}

/**
 * Clear an active warning.
 * @param {String} statName - The name of the stat to clear.
 * @param {String} thresholdName - The name of the threshold to clear
 * @param {?Object} [data] - Any relevant sample data.
 * @private
 */
RTCMonitor.prototype._clearWarning = function _clearWarning(statName, thresholdName, data) {
  var warningId = statName + ':' + thresholdName;
  var activeWarning = this._activeWarnings.get(warningId);

  if (!activeWarning || Date.now() - activeWarning.timeRaised < WARNING_TIMEOUT) { return; }
  this._activeWarnings.delete(warningId);

  this.emit('warning-cleared', Object.assign({
    name: statName,
    threshold: {
      name: thresholdName,
      value: this._thresholds[statName][thresholdName]
    }
  }, data));
};

/**
 * Raise a warning and log its raised time.
 * @param {String} statName - The name of the stat to raise.
 * @param {String} thresholdName - The name of the threshold to raise
 * @param {?Object} [data] - Any relevant sample data.
 * @private
 */
RTCMonitor.prototype._raiseWarning = function _raiseWarning(statName, thresholdName, data) {
  var warningId = statName + ':' + thresholdName;

  if (this._activeWarnings.has(warningId)) { return; }
  this._activeWarnings.set(warningId, { timeRaised: Date.now() });

  this.emit('warning', Object.assign({
    name: statName,
    threshold: {
      name: thresholdName,
      value: this._thresholds[statName][thresholdName]
    }
  }, data));
};

module.exports = RTCMonitor;

},{"./mos":17,"./stats":20,"events":34,"util":49}],17:[function(require,module,exports){
'use strict';

var rfactorConstants = {
  r0: 94.768,
  is: 1.42611
};

/**
 * Calculate the mos score of a stats object
 * @param {object} sample - Sample, must have rtt and jitter
 * @param {number} fractionLost - The fraction of packets that have been lost
     Calculated by packetsLost / totalPackets
 * @return {number} mos - Calculated MOS, 1.0 through roughly 4.5
 */
function calcMos(sample, fractionLost) {
  if (!sample ||
    !isPositiveNumber(sample.rtt) ||
    !isPositiveNumber(sample.jitter) ||
    !isPositiveNumber(fractionLost)) {
    return null;
  }

  var rFactor = calculateRFactor(sample.rtt, sample.jitter, fractionLost);

  var mos = 1 + (0.035 * rFactor) + (0.000007 * rFactor) *
    (rFactor - 60) * (100 - rFactor);

  // Make sure MOS is in range
  var isValid = (mos >= 1.0 && mos < 4.6);
  return isValid ? mos : null;
}

function calculateRFactor(rtt, jitter, fractionLost) {
  var effectiveLatency = rtt + (jitter * 2) + 10;
  var rFactor = 0;

  switch (true) {
    case effectiveLatency < 160 :
      rFactor = rfactorConstants.r0 - (effectiveLatency / 40);
      break;
    case effectiveLatency < 1000 :
      rFactor = rfactorConstants.r0 - ((effectiveLatency - 120) / 10);
      break;
    case effectiveLatency >= 1000 :
      rFactor = rfactorConstants.r0 - ((effectiveLatency) / 100 );
      break;
  }

  var multiplier = .01;
  switch (true) {
    case fractionLost === -1:
      multiplier = 0;
      rFactor = 0;
      break;
    case fractionLost <= (rFactor / 2.5):
      multiplier = 2.5;
      break;
    case fractionLost > (rFactor / 2.5) && fractionLost < 100 :
      multiplier = .25;
      break;
  }

  rFactor -= (fractionLost * multiplier);
  return rFactor;
}

function isPositiveNumber(n) {
  return typeof n === 'number' && !isNaN(n) && isFinite(n) && n >= 0;
}

module.exports = {
  calculate: calcMos
};

},{}],18:[function(require,module,exports){
'use strict';

var Log = require('../log');
var StateMachine = require('../statemachine');
var util = require('../util');
var RTCPC = require('./rtcpc');

// Refer to <http://www.w3.org/TR/2015/WD-webrtc-20150210/#rtciceconnectionstate-enum>.
var ICE_CONNECTION_STATES = {
  new: [
    'checking',
    'closed'
  ],
  checking: [
    'new',
    'connected',
    'failed',
    'closed',
    // Not in the spec, but Chrome can go to completed.
    'completed'
  ],
  connected: [
    'new',
    'disconnected',
    'completed',
    'closed'
  ],
  completed: [
    'new',
    'disconnected',
    'closed',
    // Not in the spec, but Chrome can go to completed.
    'completed'
  ],
  failed: [
    'new',
    'disconnected',
    'closed'
  ],
  disconnected: [
    'connected',
    'completed',
    'failed',
    'closed'
  ],
  closed: []
};

var INITIAL_ICE_CONNECTION_STATE = 'new';

// These differ slightly from the normal WebRTC state transitions: since we
// never expect the 'have-local-pranswer' or 'have-remote-pranswer' states, we
// filter them out.
var SIGNALING_STATES = {
  stable: [
    'have-local-offer',
    'have-remote-offer',
    'closed'
  ],
  'have-local-offer': [
    'stable',
    'closed'
  ],
  'have-remote-offer': [
    'stable',
    'closed'
  ],
  closed: []
};

var INITIAL_SIGNALING_STATE = 'stable';

/**
 * @typedef {Object} PeerConnection
 * @param device
 * @param options
 * @return {PeerConnection}
 * @constructor
 */
function PeerConnection(device, getUserMedia, options) {
  if (!device || !getUserMedia) {
    throw new Error('Device and getUserMedia are required arguments');
  }

  if (!(this instanceof PeerConnection)) {
    return new PeerConnection(device, getUserMedia, options);
  }

  function noop() { }
  this.onopen = noop;
  this.onerror = noop;
  this.onclose = noop;
  this.ondisconnect = noop;
  this.onreconnect = noop;
  this.onsignalingstatechange = noop;
  this.oniceconnectionstatechange = noop;
  this.onicecandidate = noop;
  this.onvolume = noop;
  this.version = null;
  this.pstream = device.stream;
  this.stream = null;
  this.sinkIds = new Set(['default']);
  this.outputs = new Map();
  this.status = 'connecting';
  this.callSid = null;
  this.isMuted = false;
  this.getUserMedia = getUserMedia;

  var AudioContext = typeof window !== 'undefined'
    && (window.AudioContext || window.webkitAudioContext);
  this._isSinkSupported = !!AudioContext &&
    typeof HTMLAudioElement !== 'undefined' && HTMLAudioElement.prototype.setSinkId;
  // NOTE(mmalavalli): Since each Connection creates its own AudioContext,
  // after 6 instances an exception is thrown. Refer https://www.w3.org/2011/audio/track/issues/3.
  // In order to get around it, we are re-using the Device's AudioContext.
  this._audioContext = AudioContext && device.audio._audioContext;
  this._masterAudio = null;
  this._masterAudioDeviceId = null;
  this._mediaStreamSource = null;
  this._dtmfSender = null;
  this._dtmfSenderUnsupported = false;
  this._callEvents = [];
  this._nextTimeToPublish = Date.now();
  this._onAnswerOrRinging = noop;
  this._remoteStream = null;
  this._shouldStopTracks = true;
  this._shouldManageStream = true;
  Log.mixinLog(this, '[Twilio.PeerConnection]');
  this.log.enabled = device.options.debug;
  this.log.warnings = device.options.warnings;

  this._iceConnectionStateMachine = new StateMachine(ICE_CONNECTION_STATES,
    INITIAL_ICE_CONNECTION_STATE);
  this._signalingStateMachine = new StateMachine(SIGNALING_STATES,
    INITIAL_SIGNALING_STATE);

  this.options = options = options || {};
  this.navigator = options.navigator
    || (typeof navigator !== 'undefined' ? navigator : null);
  this.util = options.util || util;

  return this;
}

PeerConnection.prototype.uri = function() {
  return this._uri;
};

/**
 * Open the underlying RTCPeerConnection with a MediaStream obtained by
 *   passed constraints. The resulting MediaStream is created internally
 *   and will therefore be managed and destroyed internally.
 * @param {MediaStreamConstraints} constraints
 */
PeerConnection.prototype.openWithConstraints = function(constraints) {
  return this.getUserMedia({ audio: constraints })
    .then(this._setInputTracksFromStream.bind(this, false));
};

/**
 * Open the underlying RTCPeerConnection with an existing MediaStream. Since
 *   this MediaStream is being created externally, we do not want to manage
 *   or destroy it internally as we expect it to be managed by the caller
 *   of this method.
 * @param {MediaStream} stream
 */
PeerConnection.prototype.openWithStream = function(stream) {
  var self = this;
  return this._setInputTracksFromStream(true, stream).then(function() {
    self._shouldManageStream = false;
  });
};


/**
 * Replace the existing input audio tracks with the audio tracks from the
 *   passed input audio stream. We re-use the existing stream because
 *   the AnalyzerNode is bound to the stream.
 * @param {MediaStream} stream
 */
PeerConnection.prototype.setInputTracksFromStream = function(stream) {
  var self = this;
  return this._setInputTracksFromStream(true, stream).then(function() {
    self._shouldStopTracks = false;
    self._shouldManageStream = false;
  });
};

PeerConnection.prototype._createAnalyser = function(stream, audioContext) {
  var analyser = audioContext.createAnalyser();
  analyser.fftSize = 32;
  analyser.smoothingTimeConstant = 0.3;

  var streamSource = audioContext.createMediaStreamSource(stream);
  streamSource.connect(analyser);

  return analyser;
};

PeerConnection.prototype._setVolumeHandler = function(handler) {
  this.onvolume = handler;
};
PeerConnection.prototype._startPollingVolume = function() {
  if (!this._audioContext || !this.stream || !this._remoteStream) {
    return;
  }

  var audioContext = this._audioContext;

  var inputAnalyser = this._inputAnalyser = this._createAnalyser(this.stream, audioContext);
  var inputBufferLength = inputAnalyser.frequencyBinCount;
  var inputDataArray = new Uint8Array(inputBufferLength);

  var outputAnalyser = this._outputAnalyser = this._createAnalyser(this._remoteStream, audioContext);
  var outputBufferLength = outputAnalyser.frequencyBinCount;
  var outputDataArray = new Uint8Array(outputBufferLength);

  var self = this;
  requestAnimationFrame(function emitVolume() {
    if (!self._audioContext) {
      return;
    } else if (self.status === 'closed') {
      self._inputAnalyser.disconnect();
      self._outputAnalyser.disconnect();
      return;
    }

    self._inputAnalyser.getByteFrequencyData(inputDataArray);
    var inputVolume = self.util.average(inputDataArray);

    self._outputAnalyser.getByteFrequencyData(outputDataArray);
    var outputVolume = self.util.average(outputDataArray);

    self.onvolume(inputVolume / 255, outputVolume / 255);

    requestAnimationFrame(emitVolume);
  });
};

PeerConnection.prototype._stopStream = function _stopStream(stream) {
  // We shouldn't stop the tracks if they were not created inside
  //   this PeerConnection.
  if (!this._shouldStopTracks) {
    return;
  }

  if (typeof MediaStreamTrack.prototype.stop === 'function') {
    var audioTracks = typeof stream.getAudioTracks === 'function'
      ? stream.getAudioTracks() : stream.audioTracks;
    audioTracks.forEach(function(track) {
      track.stop();
    });
  }
  // NOTE(mroberts): This is just a fallback to any ancient browsers that may
  // not implement MediaStreamTrack.stop.
  else {
    stream.stop();
  }
};

/**
 * Replace the tracks of the current stream with new tracks. We do this rather than replacing the
 *   whole stream because AnalyzerNodes are bound to a stream.
 * @param {Boolean} shouldClone - Whether the stream should be cloned if it is the first
 *   stream, or set directly. As a rule of thumb, streams that are passed in externally may have
 *   their lifecycle managed externally, and should be cloned so that we do not tear it or its tracks
 *   down when the call ends. Streams that we create internally (inside PeerConnection) should be set
 *   directly so that when the call ends it is disposed of.
 * @param {MediaStream} newStream - The new stream to copy the tracks over from.
 * @private
 */
PeerConnection.prototype._setInputTracksFromStream = function(shouldClone, newStream) {
  var self = this;

  if (!newStream) {
    return Promise.reject(new Error('Can not set input stream to null while in a call'));
  }

  if (!newStream.getAudioTracks().length) {
    return Promise.reject(new Error('Supplied input stream has no audio tracks'));
  }

  var localStream = this.stream;

  if (!localStream) {
    // We can't use MediaStream.clone() here because it stopped copying over tracks
    //   as of Chrome 61. https://bugs.chromium.org/p/chromium/issues/detail?id=770908
    this.stream = shouldClone ? cloneStream(newStream) : newStream;
  } else {
    this._stopStream(localStream);

    removeStream(this.version.pc, localStream);
    localStream.getAudioTracks().forEach(localStream.removeTrack, localStream);
    newStream.getAudioTracks().forEach(localStream.addTrack, localStream);
    addStream(this.version.pc, newStream);
  }

  // Apply mute settings to new input track
  this.mute(this.isMuted);

  if (!this.version) {
    return Promise.resolve(this.stream);
  }

  return new Promise(function(resolve, reject) {
    self.version.createOffer({ audio: true }, function onOfferSuccess() {
      self.version.processAnswer(self._answerSdp, function() {
        if (self._audioContext) {
          self._inputAnalyser = self._createAnalyser(self.stream, self._audioContext);
        }
        resolve(self.stream);
      }, reject);
    }, reject);
  });
};

PeerConnection.prototype._onInputDevicesChanged = function() {
  if (!this.stream) { return; }

  // If all of our active tracks are ended, then our active input was lost
  var activeInputWasLost = this.stream.getAudioTracks().every(function(track) {
    return track.readyState === 'ended';
  });

  // We only want to act if we manage the stream in PeerConnection (It was created
  // here, rather than passed in.)
  if (activeInputWasLost && this._shouldManageStream) {
    this.openWithConstraints(true);
  }
};

PeerConnection.prototype._setSinkIds = function(sinkIds) {
  if (!this._isSinkSupported) {
    return Promise.reject(new Error('Audio output selection is not supported by this browser'));
  }

  this.sinkIds = new Set(sinkIds.forEach ? sinkIds : [sinkIds]);
  return this.version
    ? this._updateAudioOutputs()
    : Promise.resolve();
};

PeerConnection.prototype._updateAudioOutputs = function updateAudioOutputs() {
  var addedOutputIds = Array.from(this.sinkIds).filter(function(id) {
    return !this.outputs.has(id);
  }, this);

  var removedOutputIds = Array.from(this.outputs.keys()).filter(function(id) {
    return !this.sinkIds.has(id);
  }, this);

  var self = this;
  var createOutputPromises = addedOutputIds.map(this._createAudioOutput, this);
  return Promise.all(createOutputPromises).then(function() {
    return Promise.all(removedOutputIds.map(self._removeAudioOutput, self));
  });
};

PeerConnection.prototype._createAudio = function createAudio(arr) {
  return new Audio(arr);
};

PeerConnection.prototype._createAudioOutput = function createAudioOutput(id) {
  var dest = this._audioContext.createMediaStreamDestination();
  this._mediaStreamSource.connect(dest);

  var audio = this._createAudio();
  setAudioSource(audio, dest.stream);

  var self = this;
  return audio.setSinkId(id).then(function() {
    return audio.play();
  }).then(function() {
    self.outputs.set(id, {
      audio: audio,
      dest: dest
    });
  });
};

PeerConnection.prototype._removeAudioOutputs = function removeAudioOutputs() {
  return Array.from(this.outputs.keys()).map(this._removeAudioOutput, this);
};

PeerConnection.prototype._disableOutput = function disableOutput(pc, id) {
  var output = pc.outputs.get(id);
  if (!output) { return; }

  if (output.audio) {
    output.audio.pause();
    output.audio.src = '';
  }

  if (output.dest) {
    output.dest.disconnect();
  }
};

/**
 * Disable a non-master output, and update the master output to assume its state. This
 *   is called when the device ID assigned to the master output has been removed from
 *   active devices. We can not simply remove the master audio output, so we must
 *   instead reassign it.
 * @private
 * @param {PeerConnection} pc
 * @param {string} masterId - The current device ID assigned to the master audio element.
 */
PeerConnection.prototype._reassignMasterOutput = function reassignMasterOutput(pc, masterId) {
  var masterOutput = pc.outputs.get(masterId);
  pc.outputs.delete(masterId);

  var self = this;
  var idToReplace = Array.from(pc.outputs.keys())[0] || 'default';
  return masterOutput.audio.setSinkId(idToReplace).then(function() {
    self._disableOutput(pc, idToReplace);

    pc.outputs.set(idToReplace, masterOutput);
    pc._masterAudioDeviceId = idToReplace;
  }).catch(function rollback(reason) {
    pc.outputs.set(masterId, masterOutput);
    throw reason;
  });
};

PeerConnection.prototype._removeAudioOutput = function removeAudioOutput(id) {
  if (this._masterAudioDeviceId === id) {
    return this._reassignMasterOutput(this, id);
  }

  this._disableOutput(this, id);
  this.outputs.delete(id);

  return Promise.resolve();
};

/**
 * Use an AudioContext to potentially split our audio output stream to multiple
 *   audio devices. This is only available to browsers with AudioContext and
 *   HTMLAudioElement.setSinkId() available. We save the source stream in
 *   _masterAudio, and use it for one of the active audio devices. We keep
 *   track of its ID because we must replace it if we lose its initial device.
 */
PeerConnection.prototype._onAddTrack = function onAddTrack(pc, stream) {
  var audio = pc._masterAudio = this._createAudio();
  setAudioSource(audio, stream);
  audio.play();

  // Assign the initial master audio element to a random active output device
  var deviceId = Array.from(pc.outputs.keys())[0] || 'default';
  pc._masterAudioDeviceId = deviceId;
  pc.outputs.set(deviceId, {
    audio: audio
  });

  pc._mediaStreamSource = pc._audioContext.createMediaStreamSource(stream);

  pc.pcStream = stream;
  pc._updateAudioOutputs();
};

/**
 * Use a single audio element to play the audio output stream. This does not
 *   support multiple output devices, and is a fallback for when AudioContext
 *   and/or HTMLAudioElement.setSinkId() is not available to the client.
 */
PeerConnection.prototype._fallbackOnAddTrack = function fallbackOnAddTrack(pc, stream) {
  var audio = document && document.createElement('audio');
  audio.autoplay = true;

  if (!setAudioSource(audio, stream)) {
    pc.log('Error attaching stream to element.');
  }

  pc.outputs.set('default', {
    audio: audio
  });
};

PeerConnection.prototype._setupPeerConnection = function(rtcConstraints, iceServers) {
  var self = this;
  var version = this._getProtocol();
  version.create(this.log, rtcConstraints, iceServers);
  addStream(version.pc, this.stream);

  var eventName = 'ontrack' in version.pc
    ? 'ontrack' : 'onaddstream';

  version.pc[eventName] = function(event) {
    var stream = self._remoteStream = event.stream || event.streams[0];

    if (self._isSinkSupported) {
      self._onAddTrack(self, stream);
    } else {
      self._fallbackOnAddTrack(self, stream);
    }

    self._startPollingVolume();
  };
  return version;
};
PeerConnection.prototype._setupChannel = function() {
  var self = this;
  var pc = this.version.pc;

  // Chrome 25 supports onopen
  self.version.pc.onopen = function() {
    self.status = 'open';
    self.onopen();
  };

  // Chrome 26 doesn't support onopen so must detect state change
  self.version.pc.onstatechange = function() {
    if (self.version.pc && self.version.pc.readyState === 'stable') {
      self.status = 'open';
      self.onopen();
    }
  };

  // Chrome 27 changed onstatechange to onsignalingstatechange
  self.version.pc.onsignalingstatechange = function() {
    var state = pc.signalingState;
    self.log('signalingState is "' + state + '"');

    // Update our internal state machine.
    try {
      self._signalingStateMachine.transition(state);
    } catch (error) {
      self.log('Failed to transition to signaling state ' + state + ': ' + error);
    }

    if (self.version.pc && self.version.pc.signalingState === 'stable') {
      self.status = 'open';
      self.onopen();
    }

    self.onsignalingstatechange(pc.signalingState);
  };

  pc.onicecandidate = function onicecandidate(event) {
    self.onicecandidate(event.candidate);
  };

  pc.oniceconnectionstatechange = function() {
    var state = pc.iceConnectionState;
    // Grab our previous state to help determine cause of state change
    var previousState = self._iceConnectionStateMachine.currentState;

    // Update our internal state machine.
    try {
      self._iceConnectionStateMachine.transition(state);
    } catch (error) {
      self.log('Failed to transition to ice connection state ' + state + ': ' + error);
    }

    var message;
    switch (state) {
      case 'connected':
        if (previousState === 'disconnected') {
          message = 'ICE liveliness check succeeded. Connection with Twilio restored';
          self.log(message);
          self.onreconnect(message);
        }
        break;
      case 'disconnected':
        message = 'ICE liveliness check failed. May be having trouble connecting to Twilio';
        self.log(message);
        self.ondisconnect(message);
        break;
      case 'failed':
        // Takes care of checking->failed and disconnected->failed
        message = (previousState === 'checking'
          ? 'ICE negotiation with Twilio failed.'
          : 'Connection with Twilio was interrupted.')
          + ' Call will terminate.';

        self.log(message);
        self.onerror({
          info: {
            code: 31003,
            message: message
          },
          disconnect: true
        });
        break;
      default:
        self.log('iceConnectionState is "' + state + '"');
    }

    self.oniceconnectionstatechange(state);
  };
};
PeerConnection.prototype._initializeMediaStream = function(rtcConstraints, iceServers) {
  // if mediastream already open then do nothing
  if (this.status === 'open') {
    return false;
  }
  if (this.pstream.status === 'disconnected') {
    this.onerror({ info: {
      code: 31000,
      message: 'Cannot establish connection. Client is disconnected'
    } });
    this.close();
    return false;
  }
  this.version = this._setupPeerConnection(rtcConstraints, iceServers);
  this._setupChannel();
  return true;
};
PeerConnection.prototype.makeOutgoingCall = function(token, params, callsid, rtcConstraints, iceServers, onMediaStarted) {
  if (!this._initializeMediaStream(rtcConstraints, iceServers)) {
    return;
  }

  var self = this;
  this.callSid = callsid;
  function onAnswerSuccess() {
    onMediaStarted(self.version.pc);
  }
  function onAnswerError(err) {
    var errMsg = err.message || err;
    self.onerror({ info: { code: 31000, message: 'Error processing answer: ' + errMsg } });
  }
  this._onAnswerOrRinging = function(payload) {
    if (!payload.sdp) { return; }

    self._answerSdp = payload.sdp;
    if (self.status !== 'closed') {
      self.version.processAnswer(payload.sdp, onAnswerSuccess, onAnswerError);
    }
    self.pstream.removeListener('answer', self._onAnswerOrRinging);
    self.pstream.removeListener('ringing', self._onAnswerOrRinging);
  };
  this.pstream.on('answer', this._onAnswerOrRinging);
  this.pstream.on('ringing', this._onAnswerOrRinging);

  function onOfferSuccess() {
    if (self.status !== 'closed') {
      self.pstream.publish('invite', {
        sdp: self.version.getSDP(),
        callsid: self.callSid,
        twilio: {
          accountsid: token ? self.util.objectize(token).iss : null,
          params: params
        }
      });
    }
  }

  function onOfferError(err) {
    var errMsg = err.message || err;
    self.onerror({ info: { code: 31000, message: 'Error creating the offer: ' + errMsg } });
  }

  this.version.createOffer({ audio: true }, onOfferSuccess, onOfferError);
};
PeerConnection.prototype.answerIncomingCall = function(callSid, sdp, rtcConstraints, iceServers, onMediaStarted) {
  if (!this._initializeMediaStream(rtcConstraints, iceServers)) {
    return;
  }
  this._answerSdp = sdp.replace(/^a=setup:actpass$/gm, 'a=setup:passive');
  this.callSid = callSid;
  var self = this;
  function onAnswerSuccess() {
    if (self.status !== 'closed') {
      self.pstream.publish('answer', {
        callsid: callSid,
        sdp: self.version.getSDP()
      });
      onMediaStarted(self.version.pc);
    }
  }
  function onAnswerError(err) {
    var errMsg = err.message || err;
    self.onerror({ info: { code: 31000, message: 'Error creating the answer: ' + errMsg } });
  }
  this.version.processSDP(sdp, { audio: true }, onAnswerSuccess, onAnswerError);
};
PeerConnection.prototype.close = function() {
  if (this.version && this.version.pc) {
    if (this.version.pc.signalingState !== 'closed') {
      this.version.pc.close();
    }

    this.version.pc = null;
  }
  if (this.stream) {
    this.mute(false);
    this._stopStream(this.stream);
  }
  this.stream = null;
  if (this.pstream) {
    this.pstream.removeListener('answer', this._onAnswerOrRinging);
  }
  this._removeAudioOutputs();
  if (this._mediaStreamSource) {
    this._mediaStreamSource.disconnect();
  }
  if (this._inputAnalyser) {
    this._inputAnalyser.disconnect();
  }
  if (this._outputAnalyser) {
    this._outputAnalyser.disconnect();
  }
  this.status = 'closed';
  this.onclose();
};
PeerConnection.prototype.reject = function(callSid) {
  this.callSid = callSid;
};
PeerConnection.prototype.ignore = function(callSid) {
  this.callSid = callSid;
};
/**
 * Mute or unmute input audio. If the stream is not yet present, the setting
 *   is saved and applied to future streams/tracks.
 * @params {boolean} shouldMute - Whether the input audio should
 *   be muted or unmuted.
 */
PeerConnection.prototype.mute = function(shouldMute) {
  this.isMuted = shouldMute;
  if (!this.stream) { return; }

  var audioTracks = typeof this.stream.getAudioTracks === 'function'
    ? this.stream.getAudioTracks()
    : this.stream.audioTracks;

  audioTracks.forEach(function(track) {
    track.enabled = !shouldMute;
  });
};
/**
 * Get or create an RTCDTMFSender for the first local audio MediaStreamTrack
 * we can get from the RTCPeerConnection. Return null if unsupported.
 * @instance
 * @returns ?RTCDTMFSender
 */
PeerConnection.prototype.getOrCreateDTMFSender = function getOrCreateDTMFSender() {
  if (this._dtmfSender || this._dtmfSenderUnsupported) {
    return this._dtmfSender || null;
  }

  var self = this;
  var pc = this.version.pc;
  if (!pc) {
    this.log('No RTCPeerConnection available to call createDTMFSender on');
    return null;
  }

  if (typeof pc.getSenders === 'function' && (typeof RTCDTMFSender === 'function' || typeof RTCDtmfSender === 'function')) {
    var sender = pc.getSenders().find(function(sender) { return sender.dtmf; });
    if (sender && sender.dtmf) {
      this.log('Using RTCRtpSender#dtmf');
      this._dtmfSender = sender.dtmf;
      return this._dtmfSender;
    }
  }

  if (typeof pc.createDTMFSender === 'function' && typeof pc.getLocalStreams === 'function') {
    var track = pc.getLocalStreams().map(function(stream) {
      var tracks = self._getAudioTracks(stream);
      return tracks && tracks[0];
    })[0];

    if (!track) {
      this.log('No local audio MediaStreamTrack available on the RTCPeerConnection to pass to createDTMFSender');
      return null;
    }

    this.log('Creating RTCDTMFSender');
    this._dtmfSender = pc.createDTMFSender(track);
    return this._dtmfSender;
  }

  this.log('RTCPeerConnection does not support RTCDTMFSender');
  this._dtmfSenderUnsupported = true;
  return null;
};

PeerConnection.prototype._canStopMediaStreamTrack = function() {
  return typeof MediaStreamTrack.prototype.stop === 'function';
};

PeerConnection.prototype._getAudioTracks = function(stream) {
  return typeof stream.getAudioTracks === 'function' ?
    stream.getAudioTracks() : stream.audioTracks;
};

PeerConnection.prototype._getProtocol = function() {
  return PeerConnection.protocol;
};

PeerConnection.protocol = (function() {
  return RTCPC.test() ? new RTCPC() : null;
})();

function addStream(pc, stream) {
  if (typeof pc.addTrack === 'function') {
    stream.getAudioTracks().forEach(function(track) {
      // The second parameters, stream, should not be necessary per the latest editor's
      //   draft, but FF requires it. https://bugzilla.mozilla.org/show_bug.cgi?id=1231414
      pc.addTrack(track, stream);
    });
  } else {
    pc.addStream(stream);
  }
}

function cloneStream(oldStream) {
  var newStream = typeof MediaStream !== 'undefined'
    ? new MediaStream()
    // eslint-disable-next-line
    : new webkitMediaStream();

  oldStream.getAudioTracks().forEach(newStream.addTrack, newStream);
  return newStream;
}

function removeStream(pc, stream) {
  if (typeof pc.removeTrack === 'function') {
    pc.getSenders().forEach(function(sender) { pc.removeTrack(sender); });
  } else {
    pc.removeStream(stream);
  }
}

/**
 * Set the source of an HTMLAudioElement to the specified MediaStream
 * @param {HTMLAudioElement} audio
 * @param {MediaStream} stream
 * @returns {boolean} Whether the audio source was set successfully
 */
function setAudioSource(audio, stream) {
  if (typeof audio.srcObject !== 'undefined') {
    audio.srcObject = stream;
  } else if (typeof audio.mozSrcObject !== 'undefined') {
    audio.mozSrcObject = stream;
  } else if (typeof audio.src !== 'undefined') {
    var _window = audio.options.window || window;
    audio.src = (_window.URL || _window.webkitURL).createObjectURL(stream);
  } else {
    return false;
  }

  return true;
}

PeerConnection.enabled = !!PeerConnection.protocol;

module.exports = PeerConnection;

},{"../log":8,"../statemachine":25,"../util":27,"./rtcpc":19}],19:[function(require,module,exports){
/* global webkitRTCPeerConnection, mozRTCPeerConnection, mozRTCSessionDescription, mozRTCIceCandidate */
'use strict';

var ortcAdapter = require('ortc-adapter');
var util = require('../util');

function RTCPC() {
  if (typeof window === 'undefined') {
    this.log('No RTCPeerConnection implementation available. The window object was not found.');
    return;
  }

  if (util.isEdge()) {
    this.RTCPeerConnection = ortcAdapter.RTCPeerConnection;
    window.RTCSessionDescription = ortcAdapter.RTCSessionDescription;
    window.RTCIceCandidate = ortcAdapter.RTCIceCandidate;
  } else if (typeof window.RTCPeerConnection === 'function') {
    this.RTCPeerConnection = window.RTCPeerConnection;
  } else if (typeof window.webkitRTCPeerConnection === 'function') {
    this.RTCPeerConnection = webkitRTCPeerConnection;
  } else if (typeof window.mozRTCPeerConnection === 'function') {
    this.RTCPeerConnection = mozRTCPeerConnection;
    window.RTCSessionDescription = mozRTCSessionDescription;
    window.RTCIceCandidate = mozRTCIceCandidate;
  } else {
    this.log('No RTCPeerConnection implementation available');
  }
}

RTCPC.prototype.create = function(log, rtcConstraints, iceServers) {
  this.log = log;
  this.pc = new this.RTCPeerConnection({ iceServers: iceServers }, rtcConstraints);
};
RTCPC.prototype.createModernConstraints = function(c) {
  // createOffer differs between Chrome 23 and Chrome 24+.
  // See https://groups.google.com/forum/?fromgroups=#!topic/discuss-webrtc/JBDZtrMumyU
  // Unfortunately I haven't figured out a way to detect which format
  // is required ahead of time, so we'll first try the old way, and
  // if we get an exception, then we'll try the new way.
  if (typeof c === 'undefined') {
    return null;
  }
  // NOTE(mroberts): As of Chrome 38, Chrome still appears to expect
  // constraints under the 'mandatory' key, and with the first letter of each
  // constraint capitalized. Firefox, on the other hand, has deprecated the
  // 'mandatory' key and does not expect the first letter of each constraint
  // capitalized.
  var nc = {};
  if (typeof webkitRTCPeerConnection !== 'undefined') {
    nc.mandatory = {};
    if (typeof c.audio !== 'undefined') {
      nc.mandatory.OfferToReceiveAudio = c.audio;
    }
    if (typeof c.video !== 'undefined') {
      nc.mandatory.OfferToReceiveVideo = c.video;
    }
  } else {
    if (typeof c.audio !== 'undefined') {
      nc.offerToReceiveAudio = c.audio;
    }
    if (typeof c.video !== 'undefined') {
      nc.offerToReceiveVideo = c.video;
    }
  }
  return nc;
};
RTCPC.prototype.createOffer = function(constraints, onSuccess, onError) {
  var self = this;

  constraints = this.createModernConstraints(constraints);
  promisifyCreate(this.pc.createOffer, this.pc)(constraints).then(function(sd) {
    return self.pc && promisifySet(self.pc.setLocalDescription, self.pc)(new RTCSessionDescription(sd));
  }).then(onSuccess, onError);
};
RTCPC.prototype.createAnswer = function(constraints, onSuccess, onError) {
  var self = this;

  constraints = this.createModernConstraints(constraints);
  promisifyCreate(this.pc.createAnswer, this.pc)(constraints).then(function(sd) {
    return self.pc && promisifySet(self.pc.setLocalDescription, self.pc)(new RTCSessionDescription(sd));
  }).then(onSuccess, onError);
};
RTCPC.prototype.processSDP = function(sdp, constraints, onSuccess, onError) {
  var self = this;

  var desc = new RTCSessionDescription({ sdp: sdp, type: 'offer' });
  promisifySet(this.pc.setRemoteDescription, this.pc)(desc).then(function() {
    self.createAnswer(constraints, onSuccess, onError);
  });
};
RTCPC.prototype.getSDP = function() {
  return this.pc.localDescription.sdp;
};
RTCPC.prototype.processAnswer = function(sdp, onSuccess, onError) {
  if (!this.pc) { return; }

  promisifySet(this.pc.setRemoteDescription, this.pc)(
    new RTCSessionDescription({ sdp: sdp, type: 'answer' })
  ).then(onSuccess, onError);
};
/* NOTE(mroberts): Firefox 18 through 21 include a `mozRTCPeerConnection`
   object, but attempting to instantiate it will throw the error

       Error: PeerConnection not enabled (did you set the pref?)

   unless the `media.peerconnection.enabled` pref is enabled. So we need to test
   if we can actually instantiate `mozRTCPeerConnection`; however, if the user
   *has* enabled `media.peerconnection.enabled`, we need to perform the same
   test that we use to detect Firefox 24 and above, namely:

       typeof (new mozRTCPeerConnection()).getLocalStreams === 'function'

*/
RTCPC.test = function() {
  if (typeof navigator === 'object') {
    var getUserMedia = (navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
      || navigator.webkitGetUserMedia
      || navigator.mozGetUserMedia
      || navigator.getUserMedia;

    if (getUserMedia && typeof window.RTCPeerConnection === 'function') {
      return true;
    } else if (getUserMedia && typeof window.webkitRTCPeerConnection === 'function') {
      return true;
    } else if (getUserMedia && typeof window.mozRTCPeerConnection === 'function') {
      try {
        // eslint-disable-next-line new-cap
        var test = new window.mozRTCPeerConnection();
        if (typeof test.getLocalStreams !== 'function')
          return false;
      } catch (e) {
        return false;
      }
      return true;
      // FIXME(mroberts): Use better criteria for identifying Edge/ORTC.
    } else if (typeof RTCIceGatherer !== 'undefined') {
      return true;
    }
  }

  return false;
};

function promisify(fn, ctx, areCallbacksFirst) {
  return function() {
    var args = Array.prototype.slice.call(arguments);

    return new Promise(function(resolve) {
      resolve(fn.apply(ctx, args));
    }).catch(function() {
      return new Promise(function(resolve, reject) {
        fn.apply(ctx, areCallbacksFirst
          ? [resolve, reject].concat(args)
          : args.concat([resolve, reject]));
      });
    });
  };
}

function promisifyCreate(fn, ctx) {
  return promisify(fn, ctx, true);
}

function promisifySet(fn, ctx) {
  return promisify(fn, ctx, false);
}

module.exports = RTCPC;

},{"../util":27,"ortc-adapter":35}],20:[function(require,module,exports){
/* eslint-disable no-fallthrough */
'use strict';

var MockRTCStatsReport = require('./mockrtcstatsreport');

var ERROR_PEER_CONNECTION_NULL = 'PeerConnection is null';
var ERROR_WEB_RTC_UNSUPPORTED = 'WebRTC statistics are unsupported';
var SIGNED_SHORT = 32767;

// (rrowland) Only needed to detect Chrome so we can force using legacy stats until standard
// stats are fixed in Chrome.
var isChrome = false;
if (typeof window !== 'undefined') {
  var isCriOS = !!window.navigator.userAgent.match('CriOS');
  var isElectron = !!window.navigator.userAgent.match('Electron');
  var isGoogle = typeof window.chrome !== 'undefined'
    && window.navigator.vendor === 'Google Inc.'
    && window.navigator.userAgent.indexOf('OPR') === -1
    && window.navigator.userAgent.indexOf('Edge') === -1;

  isChrome = isCriOS || isElectron || isGoogle;
}

/**
 * @typedef {Object} StatsOptions
 * Used for testing to inject and extract methods.
 * @property {function} [createRTCSample] - Method for parsing an RTCStatsReport
 */
/**
 * Collects any WebRTC statistics for the given {@link PeerConnection}
 * @param {PeerConnection} peerConnection - Target connection.
 * @param {StatsOptions} options - List of custom options.
 * @return {Promise<RTCSample>} Universally-formatted version of RTC stats.
 */
function getStatistics(peerConnection, options) {
  options = Object.assign({
    createRTCSample: createRTCSample
  }, options);

  if (!peerConnection) {
    return Promise.reject(new Error(ERROR_PEER_CONNECTION_NULL));
  }

  if (typeof peerConnection.getStats !== 'function') {
    return Promise.reject(new Error(ERROR_WEB_RTC_UNSUPPORTED));
  }

  // (rrowland) Force using legacy stats on Chrome until audioLevel of the outbound
  // audio track is no longer constantly zero.
  if (isChrome) {
    return new Promise(function(resolve, reject) {
      return peerConnection.getStats(resolve, reject);
    }).then(MockRTCStatsReport.fromRTCStatsResponse)
    .then(options.createRTCSample);
  }

  var promise;
  try {
    promise = peerConnection.getStats();
  } catch (e) {
    promise = new Promise(function(resolve, reject) {
      return peerConnection.getStats(resolve, reject);
    }).then(MockRTCStatsReport.fromRTCStatsResponse);
  }

  return promise.then(options.createRTCSample);
}

/**
 * @typedef {Object} RTCSample - A sample containing relevant WebRTC stats information.
 * @property {Number} [timestamp]
 * @property {String} [codecName] - MimeType name of the codec being used by the outbound audio stream
 * @property {Number} [rtt] - Round trip time
 * @property {Number} [jitter]
 * @property {Number} [packetsSent]
 * @property {Number} [packetsLost]
 * @property {Number} [packetsReceived]
 * @property {Number} [bytesReceived]
 * @property {Number} [bytesSent]
 * @property {Number} [localAddress]
 * @property {Number} [remoteAddress]
 * @property {Number} [audioInputLevel] - Between 0 and 32767
 * @property {Number} [audioOutputLevel] - Between 0 and 32767
 */
function RTCSample() { }

/**
 * Create an RTCSample object from an RTCStatsReport
 * @private
 * @param {RTCStatsReport} statsReport
 * @returns {RTCSample}
 */
function createRTCSample(statsReport) {
  var activeTransportId = null;
  var sample = new RTCSample();

  Array.from(statsReport.values()).forEach(function(stats) {
    // Firefox hack -- Firefox doesn't have dashes in type names
    var type = stats.type.replace('-', '');

    switch (type) {
      case 'inboundrtp':
        sample.timestamp = stats.timestamp;
        sample.jitter = stats.jitter * 1000;
        sample.packetsLost = stats.packetsLost;
        sample.packetsReceived = stats.packetsReceived;
        sample.bytesReceived = stats.bytesReceived;

        var inboundTrack = statsReport.get(stats.trackId);
        if (inboundTrack) {
          sample.audioOutputLevel = inboundTrack.audioLevel * SIGNED_SHORT;
        }
        break;
      case 'outboundrtp':
        sample.packetsSent = stats.packetsSent;
        sample.bytesSent = stats.bytesSent;

        if (stats.codecId && statsReport.get(stats.codecId)) {
          var mimeType = statsReport.get(stats.codecId).mimeType;
          sample.codecName = mimeType && mimeType.match(/(.*\/)?(.*)/)[2];
        }

        var outboundTrack = statsReport.get(stats.trackId);
        if (outboundTrack) {
          sample.audioInputLevel = outboundTrack.audioLevel * SIGNED_SHORT;
        }
        break;
      case 'transport':
        if (stats.dtlsState === 'connected') {
          activeTransportId = stats.id;
        }
        break;
    }
  });

  var activeTransport = statsReport.get(activeTransportId);
  if (!activeTransport) { return sample; }

  var selectedCandidatePair = statsReport.get(activeTransport.selectedCandidatePairId);
  if (!selectedCandidatePair) { return sample; }

  var localCandidate = statsReport.get(selectedCandidatePair.localCandidateId);
  var remoteCandidate = statsReport.get(selectedCandidatePair.remoteCandidateId);

  Object.assign(sample, {
    localAddress: localCandidate && localCandidate.ip,
    remoteAddress: remoteCandidate && remoteCandidate.ip,
    rtt: selectedCandidatePair && (selectedCandidatePair.currentRoundTripTime * 1000)
  });

  return sample;
}

module.exports = getStatistics;

},{"./mockrtcstatsreport":15}],21:[function(require,module,exports){
'use strict';

var EventEmitter = require('events').EventEmitter;

function EventTarget() {
  Object.defineProperties(this, {
    _eventEmitter: {
      value: new EventEmitter()
    },
    _handlers: {
      value: { }
    },
  });
}

EventTarget.prototype.dispatchEvent = function dispatchEvent(event) {
  return this._eventEmitter.emit(event.type, event);
};

EventTarget.prototype.addEventListener = function addEventListener() {
  return this._eventEmitter.addListener.apply(this._eventEmitter, arguments);
};

EventTarget.prototype.removeEventListener = function removeEventListener() {
  return this._eventEmitter.removeListener.apply(this._eventEmitter, arguments);
};

EventTarget.prototype._defineEventHandler = function _defineEventHandler(eventName) {
  var self = this;
  Object.defineProperty(this, 'on' + eventName, {
    get: function() {
      return self._handlers[eventName];
    },
    set: function(newHandler) {
      var oldHandler = self._handlers[eventName];

      if (oldHandler
        && (typeof newHandler === 'function'
          || typeof newHandler === 'undefined'
          || newHandler === null)) {
        self._handlers[eventName] = null;
        self.removeEventListener(eventName, oldHandler);
      }

      if (typeof newHandler === 'function') {
        self._handlers[eventName] = newHandler;
        self.addEventListener(eventName, newHandler);
      }
    }
  });
};

module.exports = EventTarget;

},{"events":34}],22:[function(require,module,exports){
'use strict';

function MediaDeviceInfoShim(options) {
  Object.defineProperties(this, {
    deviceId: { get: function() { return options.deviceId; } },
    groupId: { get: function() { return options.groupId; } },
    kind: { get: function() { return options.kind; } },
    label: { get: function() { return options.label; } },
  });
}

module.exports = MediaDeviceInfoShim;


},{}],23:[function(require,module,exports){
'use strict';

var EventTarget = require('./eventtarget');
var inherits = require('util').inherits;

var POLL_INTERVAL_MS = 500;

var nativeMediaDevices = typeof navigator !== 'undefined' && navigator.mediaDevices;

/**
 * Make a custom MediaDevices object, and proxy through existing functionality. If
 *   devicechange is present, we simply reemit the event. If not, we will do the
 *   detection ourselves and fire the event when necessary. The same logic exists
 *   for deviceinfochange for consistency, however deviceinfochange is our own event
 *   so it is unlikely that it will ever be native. The w3c spec for devicechange
 *   is unclear as to whether MediaDeviceInfo changes (such as label) will
 *   trigger the devicechange event. We have an open question on this here:
 *   https://bugs.chromium.org/p/chromium/issues/detail?id=585096
 */
function MediaDevicesShim() {
  EventTarget.call(this);

  this._defineEventHandler('devicechange');
  this._defineEventHandler('deviceinfochange');

  var knownDevices = [];
  Object.defineProperties(this, {
    _deviceChangeIsNative: {
      value: reemitNativeEvent(this, 'devicechange')
    },
    _deviceInfoChangeIsNative: {
      value: reemitNativeEvent(this, 'deviceinfochange')
    },
    _knownDevices: {
      value: knownDevices
    },
    _pollInterval: {
      value: null,
      writable: true
    }
  });

  if (typeof nativeMediaDevices.enumerateDevices === 'function') {
    nativeMediaDevices.enumerateDevices().then(function(devices) {
      devices.sort(sortDevicesById).forEach([].push, knownDevices);
    });
  }

  this._eventEmitter.on('newListener', function maybeStartPolling(eventName) {
    if (eventName !== 'devicechange' && eventName !== 'deviceinfochange') {
      return;
    }

    this._pollInterval = this._pollInterval
      || setInterval(sampleDevices.bind(null, this), POLL_INTERVAL_MS);
  }.bind(this));

  this._eventEmitter.on('removeListener', function maybeStopPolling() {
    if (this._pollInterval && !hasChangeListeners(this)) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }.bind(this));
}

inherits(MediaDevicesShim, EventTarget);

if (nativeMediaDevices && typeof nativeMediaDevices.enumerateDevices === 'function') {
  MediaDevicesShim.prototype.enumerateDevices = function enumerateDevices() {
    return nativeMediaDevices.enumerateDevices.apply(nativeMediaDevices, arguments);
  };
}

MediaDevicesShim.prototype.getUserMedia = function getUserMedia() {
  return nativeMediaDevices.getUserMedia.apply(nativeMediaDevices, arguments);
};

function deviceInfosHaveChanged(newDevices, oldDevices) {
  var oldLabels = oldDevices.reduce(function(map, device) {
    return map.set(device.deviceId, device.label || null);
  }, new Map());

  return newDevices.some(function(newDevice) {
    var oldLabel = oldLabels.get(newDevice.deviceId);
    return typeof oldLabel !== 'undefined' && oldLabel !== newDevice.label;
  });
}

function devicesHaveChanged(newDevices, oldDevices) {
  return newDevices.length !== oldDevices.length
    || propertyHasChanged('deviceId', newDevices, oldDevices);
}

function hasChangeListeners(mediaDevices) {
  return ['devicechange', 'deviceinfochange'].reduce(function(count, event) {
    return count + mediaDevices._eventEmitter.listenerCount(event);
  }, 0) > 0;
}

/**
 * Sample the current set of devices and emit devicechange event if a device has been
 *   added or removed, and deviceinfochange if a device's label has changed.
 * @param {MediaDevicesShim} mediaDevices
 * @private
 */
function sampleDevices(mediaDevices) {
  nativeMediaDevices.enumerateDevices().then(function(newDevices) {
    var knownDevices = mediaDevices._knownDevices;
    var oldDevices = knownDevices.slice();

    // Replace known devices in-place
    [].splice.apply(knownDevices, [0, knownDevices.length]
      .concat(newDevices.sort(sortDevicesById)));

    if (!mediaDevices._deviceChangeIsNative
      && devicesHaveChanged(knownDevices, oldDevices)) {
      mediaDevices.dispatchEvent(new Event('devicechange'));
    }

    if (!mediaDevices._deviceInfoChangeIsNative
      && deviceInfosHaveChanged(knownDevices, oldDevices)) {
      mediaDevices.dispatchEvent(new Event('deviceinfochange'));
    }
  });
}

/**
 * Accepts two sorted arrays and the name of a property to compare on objects from each.
 *   Arrays should also be of the same length.
 * @param {string} propertyName - Name of the property to compare on each object
 * @param {Array<Object>} as - The left-side array of objects to compare.
 * @param {Array<Object>} bs - The right-side array of objects to compare.
 * @private
 * @returns {boolean} True if the property of any object in array A is different than
 *   the same property of its corresponding object in array B.
 */
function propertyHasChanged(propertyName, as, bs) {
  return as.some(function(a, i) {
    return a[propertyName] !== bs[i][propertyName];
  });
}

/**
 * Re-emit the native event, if the native mediaDevices has the corresponding property.
 * @param {MediaDevicesShim} mediaDevices
 * @param {string} eventName - Name of the event
 * @private
 * @returns {boolean} Whether the native mediaDevice had the corresponding property
 */
function reemitNativeEvent(mediaDevices, eventName) {
  var methodName = 'on' + eventName;

  function dispatchEvent(event) {
    mediaDevices.dispatchEvent(event);
  }

  if (methodName in nativeMediaDevices) {
    // Use addEventListener if it's available so we don't stomp on any other listeners
    // for this event. Currently, navigator.mediaDevices.addEventListener does not exist in Safari.
    if ('addEventListener' in nativeMediaDevices) {
      nativeMediaDevices.addEventListener(eventName, dispatchEvent);
    } else {
      nativeMediaDevices[methodName] = dispatchEvent;
    }

    return true;
  }

  return false;
}

function sortDevicesById(a, b) {
  return a.deviceId < b.deviceId;
}

module.exports = (function shimMediaDevices() {
  return nativeMediaDevices ? new MediaDevicesShim() : null;
})();

},{"./eventtarget":21,"util":49}],24:[function(require,module,exports){
'use strict';

var AudioPlayer = require('AudioPlayer');

/**
 * @class
 * @param {string} name - Name of the sound
 * @param {string} url - URL of the sound
 * @param {Sound#ConstructorOptions} options
 * @property {boolean} isPlaying - Whether the Sound is currently playing audio.
 * @property {string} name - Name of the sound
 * @property {string} url - URL of the sound
 * @property {AudioContext} audioContext - The AudioContext to use if available for AudioPlayer.
 *//**
 * @typedef {Object} Sound#ConstructorOptions
 * @property {number} [maxDuration=0] - The maximum length of time to play the sound
 *   before stopping it.
 * @property {Boolean} [shouldLoop=false] - Whether the sound should be looped.
 */
function Sound(name, url, options) {
  if (!(this instanceof Sound)) {
    return new Sound(name, url, options);
  }

  if (!name || !url) {
    throw new Error('name and url are required arguments');
  }

  options = Object.assign({
    AudioFactory: typeof Audio !== 'undefined' ? Audio : null,
    maxDuration: 0,
    shouldLoop: false
  }, options);

  options.AudioPlayer = options.audioContext
    ? AudioPlayer.bind(AudioPlayer, options.audioContext)
    : options.AudioFactory;

  Object.defineProperties(this, {
    _activeEls: {
      value: new Set()
    },
    _Audio: {
      value: options.AudioPlayer
    },
    _isSinkSupported: {
      value: options.AudioFactory !== null
        && typeof options.AudioFactory.prototype.setSinkId === 'function'
    },
    _maxDuration: {
      value: options.maxDuration
    },
    _maxDurationTimeout: {
      value: null,
      writable: true
    },
    _playPromise: {
      value: null,
      writable: true
    },
    _shouldLoop: {
      value: options.shouldLoop
    },
    _sinkIds: {
      value: ['default']
    },
    isPlaying: {
      enumerable: true,
      get: function() {
        return !!this._playPromise;
      }
    },
    name: {
      enumerable: true,
      value: name
    },
    url: {
      enumerable: true,
      value: url
    }
  });

  if (this._Audio) {
    preload(this._Audio, url);
  }
}

function preload(AudioFactory, url) {
  var el = new AudioFactory(url);
  el.preload = 'auto';
  el.muted = true;

  // Play it (muted) as soon as possible so that it does not get incorrectly caught by Chrome's
  // "gesture requirement for media playback" feature.
  // https://plus.google.com/+FrancoisBeaufort/posts/6PiJQqJzGqX
  el.play();
}

/**
 * Update the sinkIds of the audio output devices this sound should play through.
 */
Sound.prototype.setSinkIds = function setSinkIds(ids) {
  if (!this._isSinkSupported) { return; }

  ids = ids.forEach ? ids : [ids];
  [].splice.apply(this._sinkIds, [0, this._sinkIds.length].concat(ids));
};

/**
 * Stop playing the sound.
 * @return {void}
 */
Sound.prototype.stop = function stop() {
  this._activeEls.forEach(function(audioEl) {
    audioEl.pause();
    audioEl.src = '';
    audioEl.load();
  });

  this._activeEls.clear();

  clearTimeout(this._maxDurationTimeout);

  this._playPromise = null;
  this._maxDurationTimeout = null;
};

/**
 * Start playing the sound. Will stop the currently playing sound first.
 */
Sound.prototype.play = function play() {
  if (this.isPlaying) {
    this.stop();
  }

  if (this._maxDuration > 0) {
    this._maxDurationTimeout = setTimeout(this.stop.bind(this), this._maxDuration);
  }

  var self = this;
  var playPromise = this._playPromise = Promise.all(this._sinkIds.map(function createAudioElement(sinkId) {
    if (!self._Audio) {
      return Promise.resolve();
    }

    var audioElement = new self._Audio(self.url);
    audioElement.loop = self._shouldLoop;

    audioElement.addEventListener('ended', function() {
      self._activeEls.delete(audioElement);
    });

    /**
     * (rrowland) Bug in Chrome 53 & 54 prevents us from calling Audio.setSinkId without
     *   crashing the tab. https://bugs.chromium.org/p/chromium/issues/detail?id=655342
     */
    return new Promise(function(resolve) {
      audioElement.addEventListener('canplaythrough', resolve);
    }).then(function() {
      // If stop has already been called, or another play has been initiated,
      // bail out before setting up the element to play.
      if (!self.isPlaying || self._playPromise !== playPromise) {
        return Promise.resolve();
      }

      return (self._isSinkSupported
          ? audioElement.setSinkId(sinkId)
          : Promise.resolve()).then(function setSinkIdSuccess() {
        self._activeEls.add(audioElement);
        return audioElement.play();
      }).then(function playSuccess() {
        return audioElement;
      }, function playFailure(reason) {
        self._activeEls.delete(audioElement);
        throw reason;
      });
    });
  }));

  return playPromise;
};

module.exports = Sound;

},{"AudioPlayer":33}],25:[function(require,module,exports){
'use strict';

var inherits = require('util').inherits;

/**
 * Construct a {@link StateMachine}.
 * @class
 * @classdesc A {@link StateMachine} is defined by an object whose keys are
 *   state names and whose values are arrays of valid states to transition to.
 *   All state transitions, valid or invalid, are recorded.
 * @param {?string} initialState
 * @param {object} states
 * @property {string} currentState
 * @proeprty {object} states
 * @property {Array<StateTransition>} transitions
 */
function StateMachine(states, initialState) {
  if (!(this instanceof StateMachine)) {
    return new StateMachine(states, initialState);
  }
  var currentState = initialState;
  Object.defineProperties(this, {
    _currentState: {
      get: function() {
        return currentState;
      },
      set: function(_currentState) {
        currentState = _currentState;
      }
    },
    currentState: {
      enumerable: true,
      get: function() {
        return currentState;
      }
    },
    states: {
      enumerable: true,
      value: states
    },
    transitions: {
      enumerable: true,
      value: []
    }
  });
  Object.freeze(this);
}

/**
 * Transition the {@link StateMachine}, recording either a valid or invalid
 * transition. If the transition was valid, we complete the transition before
 * throwing the {@link InvalidStateTransition}.
 * @param {string} to
 * @throws {InvalidStateTransition}
 * @returns {this}
 */
StateMachine.prototype.transition = function transition(to) {
  var from = this.currentState;
  var valid = this.states[from];
  var newTransition = valid && valid.indexOf(to) !== -1
    ? new StateTransition(from, to)
    : new InvalidStateTransition(from, to);
  this.transitions.push(newTransition);
  this._currentState = to;
  if (newTransition instanceof InvalidStateTransition) {
    throw newTransition;
  }
  return this;
};

/**
 * Construct a {@link StateTransition}.
 * @class
 * @param {?string} from
 * @param {string} to
 * @property {?string} from
 * @property {string} to
 */
function StateTransition(from, to) {
  Object.defineProperties(this, {
    from: {
      enumerable: true,
      value: from
    },
    to: {
      enumerable: true,
      value: to
    }
  });
}

/**
 * Construct an {@link InvalidStateTransition}.
 * @class
 * @augments Error
 * @augments StateTransition
 * @param {?string} from
 * @param {string} to
 * @property {?string} from
 * @property {string} to
 * @property {string} message
 */
function InvalidStateTransition(from, to) {
  if (!(this instanceof InvalidStateTransition)) {
    return new InvalidStateTransition(from, to);
  }
  Error.call(this);
  StateTransition.call(this, from, to);
  var errorMessage = 'Invalid transition from ' +
    (typeof from === 'string' ? '"' + from + '"' : 'null') + ' to "' + to + '"';
  Object.defineProperties(this, {
    message: {
      enumerable: true,
      value: errorMessage
    }
  });
  Object.freeze(this);
}

inherits(InvalidStateTransition, Error);

module.exports = StateMachine;

},{"util":49}],26:[function(require,module,exports){
'use strict';

exports.SOUNDS_DEPRECATION_WARNING =
  'Device.sounds is deprecated and will be removed in the next breaking ' +
  'release. Please use the new functionality available on Device.audio.';

/**
 * Create an EventEmitter warning.
 * @param {string} event - event name
 * @param {string} name - EventEmitter name
 * @param {number} maxListeners - the maximum number of event listeners recommended
 * @returns {string} warning
 */
function generateEventWarning(event, name, maxListeners) {
  return 'The number of ' + event + ' listeners on ' + name + ' ' +
    'exceeds the recommended number of ' + maxListeners + '. ' +
    'While twilio.js will continue to function normally, this ' +
    'may be indicative of an application error. Note that ' +
    event + ' listeners exist for the lifetime of the ' +
    name + '.';
}

exports.generateEventWarning = generateEventWarning;

},{}],27:[function(require,module,exports){
/* global Set, base64 */
/* eslint-disable no-process-env */
'use strict';

var EventEmitter = require('events').EventEmitter;
var generateEventWarning = require('./strings').generateEventWarning;

function getPStreamVersion() {
  // NOTE(mroberts): Set by `Makefile'.
  return "1.4" || '1.0';
}

function getSDKHash() {
  // NOTE(mroberts): Set by `Makefile'.
  return "aaa1c1d";
}

function getReleaseVersion() {
  // NOTE(jvass): Set by `Makefile`.
  return "1.4.26";
}

function getSoundVersion() {
  // NOTE(rrowland): Set by `Makefile`.
  return "1.0.0" || '1.0.0';
}

function getTwilioRoot() {
  return 'https://media.twiliocdn.com/sdk/js/client/';
}

/**
 * Exception class.
 * @class
 * @name Exception
 * @exports Exception as Twilio.Exception
 * @memberOf Twilio
 * @param {string} message The exception message
 */
function TwilioException(message) {
  if (!(this instanceof TwilioException)) {
    return new TwilioException(message);
  }
  this.message = message;
}

/**
 * Returns the exception message.
 *
 * @return {string} The exception message.
 */
TwilioException.prototype.toString = function() {
  return 'Twilio.Exception: ' + this.message;
};

function memoize(fn) {
  return function() {
    var args = Array.prototype.slice.call(arguments, 0);
    fn.memo = fn.memo || {};

    if (!fn.memo[args]) {
      fn.memo[args] = fn.apply(null, args);
    }

    return fn.memo[args];
  };
}

function decodePayload(encodedPayload) {
  var remainder = encodedPayload.length % 4;
  if (remainder > 0) {
    var padlen = 4 - remainder;
    encodedPayload += new Array(padlen + 1).join('=');
  }
  encodedPayload = encodedPayload.replace(/-/g, '+')
    .replace(/_/g, '/');
  var decodedPayload = _atob(encodedPayload);
  return JSON.parse(decodedPayload);
}

var memoizedDecodePayload = memoize(decodePayload);

/**
 * Decodes a token.
 *
 * @name decode
 * @exports decode as Twilio.decode
 * @memberOf Twilio
 * @function
 * @param {string} token The JWT
 * @return {object} The payload
 */
function decode(token) {
  var segs = token.split('.');
  if (segs.length !== 3) {
    throw new TwilioException('Wrong number of segments');
  }
  var encodedPayload = segs[1];
  var payload = memoizedDecodePayload(encodedPayload);
  return payload;
}

function makedict(params) {
  if (params === '') return {};
  if (params.indexOf('&') === -1 && params.indexOf('=') === -1) return params;
  var pairs = params.split('&');
  var result = {};
  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i].split('=');
    result[decodeURIComponent(pair[0])] = makedict(decodeURIComponent(pair[1]));
  }
  return result;
}

function makescope(uri) {
  var parts = uri.match(/^scope:(\w+):(\w+)\??(.*)$/);
  if (!(parts && parts.length === 4)) {
    throw new TwilioException('Bad scope URI');
  }
  return {
    service: parts[1],
    privilege: parts[2],
    params: makedict(parts[3])
  };
}

/**
 * Encodes a Javascript object into a query string.
 * Based on python's urllib.urlencode.
 * @name urlencode
 * @memberOf Twilio
 * @function
 * @param {object} paramsDict The key-value store of params
 * @param {bool} doseq If True, look for values as lists for multival params
 */
function urlencode(paramsDict, doseq) {
  var parts = [];
  var value;
  doseq = doseq || false;
  for (var key in paramsDict) {
    if (doseq && (paramsDict[key] instanceof Array)) {
      for (var index in paramsDict[key]) {
        value = paramsDict[key][index];
        parts.push(
          encodeURIComponent(key) + '=' + encodeURIComponent(value)
        );
      }
    } else {
      value = paramsDict[key];
      parts.push(
        encodeURIComponent(key) + '=' + encodeURIComponent(value)
      );
    }
  }
  return parts.join('&');
}

function objectize(token) {
  var jwt = decode(token);
  var scopes = (jwt.scope.length === 0 ? [] : jwt.scope.split(' '));
  var newscopes = {};
  for (var i = 0; i < scopes.length; i++) {
    var scope = makescope(scopes[i]);
    newscopes[scope.service + ':' + scope.privilege] = scope;
  }
  jwt.scope = newscopes;
  return jwt;
}

var memoizedObjectize = memoize(objectize);

/**
 * Wrapper for btoa.
 *
 * @name btoa
 * @exports _btoa as Twilio.btoa
 * @memberOf Twilio
 * @function
 * @param {string} message The decoded string
 * @return {string} The encoded string
 */
function _btoa(message) {
  try {
    return btoa(message);
  } catch (e) {
    return new Buffer(message).toString('base64');
  }
}

/**
 * Wrapper for atob.
 *
 * @name atob
 * @exports _atob as Twilio.atob
 * @memberOf Twilio
 * @function
 * @param {string} encoded The encoded string
 * @return {string} The decoded string
 */
function _atob(encoded) {
  try {
    return atob(encoded);
  } catch (e) {
    try {
      return new Buffer(encoded, 'base64').toString('ascii');
    } catch (e2) {
      return base64.decode(encoded);
    }
  }
}

/**
 * Generates JWT tokens. For simplicity, only the payload segment is viable;
 * the header and signature are garbage.
 *
 * @param object payload The payload
 * @return string The JWT
 */
function dummyToken(payload) {
  var tokenDefaults = {
    iss: 'AC1111111111111111111111111111111',
    exp: 1400000000
  };
  for (var k in tokenDefaults) {
    payload[k] = payload[k] || tokenDefaults[k];
  }
  var encodedPayload = _btoa(JSON.stringify(payload));
  encodedPayload = encodedPayload.replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return ['*', encodedPayload, '*'].join('.');
}

function bind(fn, ctx) {
  var applied = Array.prototype.slice.call(arguments, 2);
  return function() {
    var extra = Array.prototype.slice.call(arguments);
    return fn.apply(ctx, applied.concat(extra));
  };
}

function getSystemInfo() {
  var version = getPStreamVersion();
  var hash = getSDKHash();
  var nav = typeof navigator !== 'undefined' ? navigator : {};

  var info = {
    p: 'browser',
    v: version,
    h: hash,
    browser: {
      userAgent: nav.userAgent || 'unknown',
      platform: nav.platform || 'unknown'
    },
    plugin: 'rtc'
  };

  return info;
}

function trim(str) {
  if (typeof str !== 'string') return '';
  return str.trim
    ? str.trim()
    : str.replace(/^\s+|\s+$/g, '');
}

/**
 * Splits a concatenation of multiple JSON strings into a list of JSON strings.
 *
 * @param string json The string of multiple JSON strings
 * @param boolean validate If true, thrown an error on invalid syntax
 *
 * @return array A list of JSON strings
 */
function splitObjects(json) {
  var trimmed = trim(json);
  return trimmed.length === 0 ? [] : trimmed.split('\n');
}

function generateConnectionUUID() {
  return 'TJSxxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    var v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function monitorEventEmitter(name, object) {
  object.setMaxListeners(0);
  var MAX_LISTENERS = 10;
  function monitor(event) {
    var n = EventEmitter.listenerCount(object, event);
    var warning = generateEventWarning(event, name, MAX_LISTENERS);
    if (n >= MAX_LISTENERS) {
      /* eslint-disable no-console */
      if (typeof console !== 'undefined') {
        if (console.warn) {
          console.warn(warning);
        } else if (console.log) {
          console.log(warning);
        }
      }
      /* eslint-enable no-console */
      object.removeListener('newListener', monitor);
    }
  }
  object.on('newListener', monitor);
}

// This definition of deepEqual is adapted from Node's deepEqual.
function deepEqual(a, b) {
  if (a === b) {
    return true;
  } else if (typeof a !== typeof b) {
    return false;
  } else if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  } else if (typeof a !== 'object' && typeof b !== 'object') {
    return a === b;
  }

  return objectDeepEqual(a, b);
}

var objectKeys = typeof Object.keys === 'function' ? Object.keys : function(obj) {
  var keys = [];
  for (var key in obj) {
    keys.push(key);
  }
  return keys;
};

function isUndefinedOrNull(a) {
  return typeof a === 'undefined' || a === null;
}

function objectDeepEqual(a, b) {
  if (isUndefinedOrNull(a) || isUndefinedOrNull(b)) {
    return false;
  } else if (a.prototype !== b.prototype) {
    return false;
  }

  try {
    var ka = objectKeys(a);
    var kb = objectKeys(b);
  } catch (e) {
    return false;
  }
  if (ka.length !== kb.length) {
    return false;
  }
  ka.sort();
  kb.sort();
  for (var i = ka.length - 1; i >= 0; i--) {
    var k = ka[i];
    if (!deepEqual(a[k], b[k])) {
      return false;
    }
  }
  return true;
}

function average(values) {
  return values.reduce(function(t, v) {
    return t + v;
  }) / values.length;
}

function difference(lefts, rights, getKey) {
  getKey = getKey || function(a) { return a; };

  var rightKeys = new Set(rights.map(getKey));

  return lefts.filter(function(left) {
    return !rightKeys.has(getKey(left));
  });
}

function encodescope(service, privilege, params) {
  var capability = ['scope', service, privilege].join(':');
  var empty = true;
  for (var _ in params) { void _; empty = false; break; }
  return empty ? capability : capability + '?' + buildquery(params);
}

function buildquery(params) {
  var pairs = [];
  for (var name in params) {
    var value = typeof params[name] === 'object'
      ? buildquery(params[name])
      : params[name];

    pairs.push(encodeURIComponent(name) + '=' +
      encodeURIComponent(value));
  }
}

function isFirefox(navigator) {
  navigator = navigator || (typeof window === 'undefined'
    ? global.navigator : window.navigator);

  return navigator && typeof navigator.userAgent === 'string'
    && /firefox|fxios/i.test(navigator.userAgent);
}

function isEdge(navigator) {
  navigator = navigator || (typeof window === 'undefined'
    ? global.navigator : window.navigator);

  return navigator && typeof navigator.userAgent === 'string'
    && /edge\/\d+/i.test(navigator.userAgent);
}

exports.getPStreamVersion = getPStreamVersion;
exports.getReleaseVersion = getReleaseVersion;
exports.getSoundVersion = getSoundVersion;
exports.dummyToken = dummyToken;
exports.Exception = TwilioException;
exports.decode = decode;
exports.btoa = _btoa;
exports.atob = _atob;
exports.objectize = memoizedObjectize;
exports.urlencode = urlencode;
exports.encodescope = encodescope;
exports.Set = Set;
exports.bind = bind;
exports.getSystemInfo = getSystemInfo;
exports.splitObjects = splitObjects;
exports.generateConnectionUUID = generateConnectionUUID;
exports.getTwilioRoot = getTwilioRoot;
exports.monitorEventEmitter = monitorEventEmitter;
exports.deepEqual = deepEqual;
exports.average = average;
exports.difference = difference;
exports.isFirefox = isFirefox;
exports.isEdge = isEdge;

},{"./strings":26,"events":34}],28:[function(require,module,exports){
'use strict';

var Heartbeat = require('./heartbeat').Heartbeat;
var log = require('./log');

var DefaultWebSocket = require('ws');

function noop() { }
function getTime() {
  return new Date().getTime();
}

/*
 * WebSocket transport class
 */
function WSTransport(options) {
  if (!(this instanceof WSTransport)) {
    return new WSTransport(options);
  }
  var self = this;
  self.sock = null;
  self.onopen = noop;
  self.onclose = noop;
  self.onmessage = noop;
  self.onerror = noop;

  var defaults = {
    logPrefix: '[WSTransport]',
    chunderw: 'chunderw-vpc-gll.twilio.com',
    reconnect: true,
    debug: false,
    secureSignaling: true,
    WebSocket: DefaultWebSocket
  };
  options = options || {};
  for (var prop in defaults) {
    if (prop in options) continue;
    options[prop] = defaults[prop];
  }
  self.options = options;
  self._WebSocket = options.WebSocket;

  log.mixinLog(self, self.options.logPrefix);
  self.log.enabled = self.options.debug;

  self.defaultReconnect = self.options.reconnect;

  var scheme = self.options.secureSignaling ? 'wss://' : 'ws://';
  self.uri = scheme + self.options.host + '/signal';
  return self;
}

WSTransport.prototype.msgQueue = [];
WSTransport.prototype.open = function(attempted) {
  this.log('Opening socket');
  if (this.sock && this.sock.readyState < 2) {
    this.log('Socket already open.');
    return;
  }

  this.options.reconnect = this.defaultReconnect;

  // cancel out any previous heartbeat
  if (this.heartbeat) {
    this.heartbeat.onsleep = function() {};
  }
  this.heartbeat = new Heartbeat({ interval: 15 });
  this.sock = this._connect(attempted);
};
WSTransport.prototype.send = function(msg) {
  if (this.sock) {
    if (this.sock.readyState === 0) {
      this.msgQueue.push(msg);
      return;
    }

    try {
      this.sock.send(msg);
    } catch (error) {
      this.log('Error while sending. Closing socket: ' + error.message);
      this.sock.close();
    }
  }
};
WSTransport.prototype.close = function() {
  this.log('Closing socket');
  this.options.reconnect = false;
  if (this.sock) {
    this.sock.close();
    this.sock = null;
  }
  if (this.heartbeat) {
    this.heartbeat.onsleep = function() {};
  }
};
WSTransport.prototype._cleanupSocket = function(socket) {
  if (socket) {
    this.log('Cleaning up socket');
    socket.onopen = function() { socket.close(); };
    socket.onmessage = noop;
    socket.onerror = noop;
    socket.onclose = noop;

    if (socket.readyState < 2) {
      socket.close();
    }
  }
};
WSTransport.prototype._connect = function(attempted) {
  var attempt = ++attempted || 1;

  this.log('attempting to connect');
  var sock = null;
  try {
    sock = new this._WebSocket(this.uri);
  }
  catch (e) {
    this.onerror({ code: 31000, message: e.message || 'Could not connect to ' + this.uri });
    this.close(); // close connection for good
    return null;
  }

  var self = this;

  // clean up old socket to avoid any race conditions with the callbacks
  var oldSocket = this.sock;
  var timeOpened = null;

  var connectTimeout = setTimeout(function() {
    self.log('connection attempt timed out');
    sock.onclose = function() {};
    sock.close();
    self.onclose();
    self._tryReconnect(attempt);
  }, 5000);

  sock.onopen = function() {
    clearTimeout(connectTimeout);
    self._cleanupSocket(oldSocket);
    timeOpened = getTime();
    self.log('Socket opened');

    // setup heartbeat onsleep and beat it once to get timer started
    self.heartbeat.onsleep = function() {
      // treat it like the socket closed because when network drops onclose does not get called right away
      self.log('Heartbeat timed out. closing socket');
      self.sock.onclose = function() {};
      self.sock.close();
      self.onclose();
      self._tryReconnect(attempt);
    };
    self.heartbeat.beat();

    self.onopen();

    // send after onopen to preserve order
    for (var i = 0; i < self.msgQueue.length; i++) {
      self.sock.send(self.msgQueue[i]);
    }
    self.msgQueue = [];
  };
  sock.onclose = function() {
    clearTimeout(connectTimeout);
    self._cleanupSocket(oldSocket);

    // clear the heartbeat onsleep callback
    self.heartbeat.onsleep = function() {};

    // reset backoff counter if connection was open for enough time to be considered successful
    if (timeOpened) {
      var socketDuration = (getTime() - timeOpened) / 1000;
      if (socketDuration > 10) {
        attempt = 1;
      }
    }

    self.log('Socket closed');
    self.onclose();
    self._tryReconnect(attempt);
  };
  sock.onerror = function(e) {
    self.log('Socket received error: ' + e.message);
    self.onerror({ code: 31000, message: e.message || 'WSTransport socket error' });
  };
  sock.onmessage = function(message) {
    self.heartbeat.beat();
    if (message.data === '\n') {
      self.send('\n');
      return;
    }

    // TODO check if error passed back from gateway is 5XX error
    // if so, retry connection with exponential backoff
    self.onmessage(message);
  };

  return sock;
};
WSTransport.prototype._tryReconnect = function(attempted) {
  attempted = attempted || 0;
  if (this.options.reconnect) {
    this.log('Attempting to reconnect.');
    var self = this;
    var backoff = 0;
    if (attempted < 5) {
      // setup exponentially random backoff
      var minBackoff = 30;
      var backoffRange = Math.pow(2, attempted) * 50;
      backoff = minBackoff + Math.round(Math.random() * backoffRange);
    } else {
      // continuous reconnect attempt
      backoff = 3000;
    }
    setTimeout( function() {
      self.open(attempted);
    }, backoff);
  }
};

exports.WSTransport = WSTransport;

},{"./heartbeat":7,"./log":8,"ws":29}],29:[function(require,module,exports){
'use strict';
module.exports = WebSocket;

},{}],30:[function(require,module,exports){
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const Deferred_1 = require("./Deferred");
const EventTarget_1 = require("./EventTarget");
/**
 * An {@link AudioPlayer} is an HTMLAudioElement-like object that uses AudioContext
 *   to circumvent browser limitations.
 */
class AudioPlayer extends EventTarget_1.default {
    /**
     * @private
     */
    constructor(audioContext, srcOrOptions = {}, options = {}) {
        super();
        /**
         * The AudioBufferSourceNode of the actively loaded sound. Null if a sound
         *   has not been loaded yet. This is re-used for each time the sound is
         *   played.
         */
        this._audioNode = null;
        /**
         * An Array of deferred-like objects for each pending `play` Promise. When
         *   .pause() is called or .src is set, all pending play Promises are
         *   immediately rejected.
         */
        this._pendingPlayDeferreds = [];
        /**
         * Whether or not the audio element should loop. If disabled during playback,
         *   playing continues until the sound ends and then stops looping.
         */
        this._loop = false;
        /**
         * The source URL of the sound to play. When set, the currently playing sound will stop.
         */
        this._src = '';
        /**
         * The current sinkId of the device audio is being played through.
         */
        this._sinkId = 'default';
        if (typeof srcOrOptions !== 'string') {
            options = srcOrOptions;
        }
        this._audioContext = audioContext;
        this._audioElement = new (options.AudioFactory || Audio)();
        this._bufferPromise = this._createPlayDeferred().promise;
        this._destination = this._audioContext.destination;
        this._gainNode = this._audioContext.createGain();
        this._gainNode.connect(this._destination);
        this._XMLHttpRequest = options.XMLHttpRequestFactory || XMLHttpRequest;
        this.addEventListener('canplaythrough', () => {
            this._resolvePlayDeferreds();
        });
        if (typeof srcOrOptions === 'string') {
            this.src = srcOrOptions;
        }
    }
    get destination() { return this._destination; }
    get loop() { return this._loop; }
    set loop(shouldLoop) {
        // If a sound is already looping, it should continue playing
        //   the current playthrough and then stop.
        if (!shouldLoop && this.loop && !this.paused) {
            const self = this;
            function pauseAfterPlaythrough() {
                self._audioNode.removeEventListener('ended', pauseAfterPlaythrough);
                self.pause();
            }
            this._audioNode.addEventListener('ended', pauseAfterPlaythrough);
        }
        this._loop = shouldLoop;
    }
    /**
     * Whether the audio element is muted.
     */
    get muted() { return this._gainNode.gain.value === 0; }
    set muted(shouldBeMuted) {
        this._gainNode.gain.value = shouldBeMuted ? 0 : 1;
    }
    /**
     * Whether the sound is paused. this._audioNode only exists when sound is playing;
     *   otherwise AudioPlayer is considered paused.
     */
    get paused() { return this._audioNode === null; }
    get src() { return this._src; }
    set src(src) {
        this._load(src);
    }
    get sinkId() { return this._sinkId; }
    /**
     * Stop any ongoing playback and reload the source file.
     */
    load() {
        this._load(this._src);
    }
    /**
     * Pause the audio coming from this AudioPlayer. This will reject any pending
     *   play Promises.
     */
    pause() {
        if (this.paused) {
            return;
        }
        this._audioElement.pause();
        this._audioNode.stop();
        this._audioNode.disconnect(this._gainNode);
        this._audioNode = null;
        this._rejectPlayDeferreds(new Error('The play() request was interrupted by a call to pause().'));
    }
    /**
     * Play the sound. If the buffer hasn't loaded yet, wait for the buffer to load. If
     *   the source URL is not set yet, this Promise will remain pending until a source
     *   URL is set.
     */
    play() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.paused) {
                yield this._bufferPromise;
                if (!this.paused) {
                    return;
                }
                throw new Error('The play() request was interrupted by a call to pause().');
            }
            this._audioNode = this._audioContext.createBufferSource();
            this._audioNode.loop = this.loop;
            this._audioNode.addEventListener('ended', () => {
                if (this._audioNode && this._audioNode.loop) {
                    return;
                }
                this.dispatchEvent('ended');
            });
            const buffer = yield this._bufferPromise;
            if (this.paused) {
                throw new Error('The play() request was interrupted by a call to pause().');
            }
            this._audioNode.buffer = buffer;
            this._audioNode.connect(this._gainNode);
            this._audioNode.start();
            if (this._audioElement.srcObject) {
                return this._audioElement.play();
            }
        });
    }
    /**
     * Change which device the sound should play through.
     * @param sinkId - The sink of the device to play sound through.
     */
    setSinkId(sinkId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof this._audioElement.setSinkId !== 'function') {
                throw new Error('This browser does not support setSinkId.');
            }
            if (sinkId === this.sinkId) {
                return;
            }
            if (sinkId === 'default') {
                if (!this.paused) {
                    this._gainNode.disconnect(this._destination);
                }
                this._audioElement.srcObject = null;
                this._destination = this._audioContext.destination;
                this._gainNode.connect(this._destination);
                this._sinkId = sinkId;
                return;
            }
            yield this._audioElement.setSinkId(sinkId);
            if (this._audioElement.srcObject) {
                return;
            }
            this._gainNode.disconnect(this._audioContext.destination);
            this._destination = this._audioContext.createMediaStreamDestination();
            this._audioElement.srcObject = this._destination.stream;
            this._sinkId = sinkId;
            if (!this.paused) {
                this._gainNode.connect(this._destination);
            }
        });
    }
    /**
     * Create a Deferred for a Promise that will be resolved when .src is set or rejected
     *   when .pause is called.
     */
    _createPlayDeferred() {
        const deferred = new Deferred_1.default();
        this._pendingPlayDeferreds.push(deferred);
        return deferred;
    }
    /**
     * Stop current playback and load a sound file.
     * @param src - The source URL of the file to load
     */
    _load(src) {
        if (this._src && this._src !== src) {
            this.pause();
        }
        this._src = src;
        this._bufferPromise = new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            if (!src) {
                return this._createPlayDeferred().promise;
            }
            const buffer = yield bufferSound(this._audioContext, this._XMLHttpRequest, src);
            this.dispatchEvent('canplaythrough');
            resolve(buffer);
        }));
    }
    /**
     * Reject all deferreds for the Play promise.
     * @param reason
     */
    _rejectPlayDeferreds(reason) {
        const deferreds = this._pendingPlayDeferreds;
        deferreds.splice(0, deferreds.length).forEach(({ reject }) => reject(reason));
    }
    /**
     * Resolve all deferreds for the Play promise.
     * @param result
     */
    _resolvePlayDeferreds(result) {
        const deferreds = this._pendingPlayDeferreds;
        deferreds.splice(0, deferreds.length).forEach(({ resolve }) => resolve(result));
    }
}
exports.default = AudioPlayer;
/**
 * Use XMLHttpRequest to load the AudioBuffer of a remote audio asset.
 * @private
 * @param context - The AudioContext to use to decode the audio data
 * @param RequestFactory - The XMLHttpRequest factory to build
 * @param src - The URL of the audio asset to load.
 * @returns A Promise containing the decoded AudioBuffer.
 */
// tslint:disable-next-line:variable-name
function bufferSound(context, RequestFactory, src) {
    return __awaiter(this, void 0, void 0, function* () {
        const request = new RequestFactory();
        request.open('GET', src, true);
        request.responseType = 'arraybuffer';
        const event = yield new Promise(resolve => {
            request.addEventListener('load', resolve);
            request.send();
        });
        // Safari uses a callback here instead of a Promise.
        try {
            return context.decodeAudioData(event.target.response);
        }
        catch (e) {
            return new Promise(resolve => {
                context.decodeAudioData(event.target.response, resolve);
            });
        }
    });
}

},{"./Deferred":31,"./EventTarget":32}],31:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Deferred {
    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
    }
    get reject() { return this._reject; }
    get resolve() { return this._resolve; }
}
exports.default = Deferred;

},{}],32:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
class EventTarget {
    constructor() {
        this._eventEmitter = new events_1.EventEmitter();
    }
    addEventListener(name, handler) {
        return this._eventEmitter.addListener(name, handler);
    }
    dispatchEvent(name, ...args) {
        return this._eventEmitter.emit(name, ...args);
    }
    removeEventListener(name, handler) {
        return this._eventEmitter.removeListener(name, handler);
    }
}
exports.default = EventTarget;

},{"events":34}],33:[function(require,module,exports){
const AudioPlayer = require('./AudioPlayer');

module.exports = AudioPlayer.default;

},{"./AudioPlayer":30}],34:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        // At least give some kind of context to the user
        var err = new Error('Uncaught, unspecified "error" event. (' + er + ')');
        err.context = er;
        throw err;
      }
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    args = Array.prototype.slice.call(arguments, 1);
    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else if (listeners) {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.prototype.listenerCount = function(type) {
  if (this._events) {
    var evlistener = this._events[type];

    if (isFunction(evlistener))
      return 1;
    else if (evlistener)
      return evlistener.length;
  }
  return 0;
};

EventEmitter.listenerCount = function(emitter, type) {
  return emitter.listenerCount(type);
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],35:[function(require,module,exports){
'use strict';

module.exports.RTCIceCandidate = require('./rtcicecandidate');
module.exports.RTCPeerConnection = require('./rtcpeerconnection');
module.exports.RTCSessionDescription = require('./rtcsessiondescription');

},{"./rtcicecandidate":38,"./rtcpeerconnection":39,"./rtcsessiondescription":41}],36:[function(require,module,exports){
'use strict';

/**
 * Construct a {@link MediaSection}.
 * @class
 * @classdesc
 * @param {?string} [address="0.0.0.0"]
 * @param {?Array<RTCIceCandidate>} [candidates=[]]
 * @param {object} capabilities
 * @param {string} direction - one of "sendrecv", "sendonly", "recvonly", or "inactive"
 * @param {string} kind - one of "audio" or "video"
 * @param {string} mid
 * @param {?number} [port=9]
 * @param {?boolean} [rtcpMux=true]
 * @param {?string} streamId
 * @param {?MediaStreamTrack} track
 * @property {Array<RTCIceCandidate>} candidates
 * @property {object} capabilities
 * @property {?RTCIceCandidate} defaultCandidate
 * @property {string} direction - one of "sendrecv", "sendonly", "recvonly", or "inactive"
 * @property {string} kind - one of "audio" or "video"
 * @property {string} mid
 * @property {number} port
 * @property {boolean} rtcpMux
 * @property {?string} streamId
 * @property {?MediaStreamTrack} track
 */
function MediaSection(address, _candidates, capabilities, direction, kind, mid, port, rtcpMux, streamId, track) {
  if (!(this instanceof MediaSection)) {
    return new MediaSection(address, _candidates, capabilities, direction, kind,
      mid, port, rtcpMux, streamId, track);
  }
  var rejected = false;
  address = address || '0.0.0.0';
  port = typeof port === 'number' ? port : 9;
  rtcpMux = typeof rtcpMux === 'boolean' ? rtcpMux : true;
  streamId = streamId || null;
  track = track || null;
  Object.defineProperties(this, {
    _address: {
      get: function() {
        return address;
      },
      set: function(_address) {
        address = _address;
      }
    },
    _candidates: {
      value: []
    },
    _port: {
      get: function() {
        return port;
      },
      set: function(_port) {
        port = _port;
      }
    },
    _rejected: {
      get: function() {
        return rejected;
      },
      set: function(_rejected) {
        rejected = _rejected;
      }
    },
    _streamId: {
      get: function() {
        return streamId;
      },
      set: function(_streamId) {
        streamId = _streamId;
      }
    },
    _track: {
      get: function() {
        return track;
      },
      set: function(_track) {
        track = _track;
      }
    },
    _triples: {
      value: new Set()
    },
    candidates: {
      enumerable: true,
      get: function() {
        return this._candidates.slice();
      }
    },
    capabilities: {
      enumerable: true,
      value: capabilities
    },
    defaultCandidate: {
      enumerable: true,
      get: function() {
        return this._candidates.length ? this._candidates[0] : null;
      }
    },
    direction: {
      enumerable: true,
      value: direction
    },
    kind: {
      enumerable: true,
      value: kind
    },
    port: {
      enumerable: true,
      get: function() {
        return port;
      }
    },
    rtcpMux: {
      enumerable: true,
      value: rtcpMux
    },
    streamId: {
      enumerable: true,
      get: function() {
        return streamId;
      }
    },
    track: {
      enumerable: true,
      get: function() {
        return track;
      }
    }
  });
  if (_candidates) {
    _candidates.forEach(this.addCandidate, this);
  }
}

/**
 * Add an RTCIceCandidate to the {@link MediaSection}.
 * @param {RTCIceCandidate} candidate
 * @returns {boolean}
 */
MediaSection.prototype.addCandidate = function addCandidate(candidate) {
  var triple = [
    candidate.ip,
    candidate.port,
    candidate.protocol
  ].join(' ');
  if (!this._triples.has(triple)) {
    this._triples.add(triple);
    this._candidates.push(candidate);
    return true;
  }
  return false;
};

/**
 * Copy the {@link MediaSection}.
 * @param {?string} address - if unsupplied, use the {@link MediaSection} defaults
 * @param {?Array<RTCIceCandidates> candidates - if unsupplied, use the {@link MediaSection} defaults
 * @param {?string} capabilities - if unsupplied, copy the existing capabilities
 * @param {?string} direction - if unsupplied, copy the existing direction
 * @param {?number} port - if unsupplied, use the {@link MediaSection} defaults
 * @param {?string} streamId - if unsupplied, set to null
 * @param {?MediaStreamTrack} track - if unsupplied, set to null
 * @returns {MediaSection}
 */
MediaSection.prototype.copy = function copy(address, candidates, capabilities, direction, port, streamId, track) {
  return new MediaSection(this.address, candidates,
    capabilities || this.capabilities, direction || this.direction, this.kind,
    this.mid, port, this.rtcpMux, streamId, track);
};

/**
 * Copy and reject the {@link MediaSection}.
 * @returns {MediaSection}.
 */
MediaSection.prototype.copyAndReject = function copyAndReject() {
  var mediaSection = new MediaSection(null, this.candidates, this.capabilities,
    this.direction, this.kind, this.mid, null, this.rtcpMux);
  return mediaSection.reject();
};

/**
 * Reject the {@link MediaSection}.
 * @returns {MediaSection}
 */
MediaSection.prototype.reject = function reject() {
  // RFC 3264, Section 6:
  //
  //     To reject an offered stream, the port number in the corresponding
  //     stream in the answer MUST be set to zero. Any media formats listed
  //     are ignored. At least one MUST be present, as specified by SDP.
  //
  this.setPort(0);
  return this;
};

/**
 * Set the {@link MediaSection}'s address.
 * @param {string} address
 * @returns {MediaSection}
 */
MediaSection.prototype.setAddress = function setAddress(address) {
  this._address = address;
  return this;
};

/**
 * Set the {@link MediaSection}'s port.
 * @param {number} port
 * @returns {MediaSection}
 */
MediaSection.prototype.setPort = function setPort(port) {
  this._port = port;
  return this;
};

/* MediaSection.prototype.setStreamId = function setStreamId(streamId) {
  this._streamId = streamId;
  return this;
};

MediaSection.prototype.setTrack = function setTrack(track) {
  this._track = track;
  return this;
}; */

module.exports = MediaSection;

},{}],37:[function(require,module,exports){
'use strict';

/**
 * Construct a {@link MediaStreamEvent}.
 * @class
 * @classdesc
 * @extends Event
 * @param {string} type - one of "addstream" or "removestream"
 * @param {object} init
 * @property {MediaStream} stream
 */
function MediaStreamEvent(type, init) {
  if (!(this instanceof MediaStreamEvent)) {
    return new MediaStreamEvent(type, init);
  }
  Event.call(this, type, init);
  Object.defineProperties(this, {
    stream: {
      enumerable: true,
      value: init.stream
    }
  });
}

module.exports = MediaStreamEvent;

},{}],38:[function(require,module,exports){
'use strict';

/**
 * Construct an {@link RTCIceCandidate}.
 * @class
 * @classdesc
 * @param {object} candidate
 * @property {string} candidate
 * @property {number} sdpMLineIndex
 */
function RTCIceCandidate(candidate) {
  if (!(this instanceof RTCIceCandidate)) {
    return new RTCIceCandidate(candidate);
  }
  Object.defineProperties(this, {
    candidate: {
      enumerable: true,
      value: candidate.candidate
    },
    sdpMLineIndex: {
      enumerable: true,
      value: candidate.sdpMLineIndex
    }
  });
}

module.exports = RTCIceCandidate;

},{}],39:[function(require,module,exports){
'use strict';

var MediaSection = require('./mediasection');
var MediaStreamEvent = require('./mediastreamevent');
var RTCIceCandidate = require('./rtcicecandidate');
var RTCPeerConnectionIceEvent = require('./rtcpeerconnectioniceevent');
var RTCSessionDescription = require('./rtcsessiondescription');
var sdpTransform = require('sdp-transform');
var sdpUtils = require('./sdp-utils');

/**
 * Construct an {@link RTCPeerConnection}.
 * @class
 * @classdesc This {@link RTCPeerConnection} is implemented in terms of ORTC APIs.
 * @param {RTCConfiguration} configuration
 * @property {string} iceConnectionState
 * @property {string} iceGatheringState
 * @property {?RTCSessionDescription} localDescription
 * @property {?function} onaddstream
 * @property {?function} onicecandidate
 * @property {?function} oniceconnectionstatechange
 * @property {?function} onsignalingstatechange
 * @property {?RTCSessionDescription} remoteDescription
 * @property {string} signalingState
 */
function RTCPeerConnection(configuration) {
  if (!(this instanceof RTCPeerConnection)) {
    return new RTCPeerConnection(configuration);
  }

  // ICE Gatherer

  var gatherOptions = makeGatherOptions(configuration);
  /* global RTCIceGatherer:true */
  var iceGatherer = new RTCIceGatherer(gatherOptions);
  var iceGatheringCompleted = false;

  iceGatherer.onlocalcandidate = this._onlocalcandidate.bind(this);

  var onicecandidate = null;
  var onicecandidateWasSet = false;

  var iceCandidatesAdded = 0;

  // ICE Transport

  /* global RTCIceTransport:true */
  var iceTransport = new RTCIceTransport();
  var oniceconnectionstatechange = null;

  iceTransport.onicestatechange = this._onicestatechange.bind(this);

  // DTLS Transport

  /* global RTCDtlsTransport:true */
  var dtlsTransport = new RTCDtlsTransport(iceTransport);

  dtlsTransport.ondtlsstatechange = this._ondtlsstatechange.bind(this);

  // Descriptions

  var signalingState = 'stable';
  var onsignalingstatechange = null;

  var localDescription = null;
  var remoteDescription = null;

  // Streams

  var onaddstream = null;

  Object.defineProperties(this, {
    _dtlsTransport: {
      value: dtlsTransport
    },
    _dtmfSenders: {
      value: new Map()
    },
    _gatherOptions: {
      value: gatherOptions
    },
    _iceCandidatesAdded: {
      get: function() {
        return iceCandidatesAdded;
      },
      set: function(_iceCandidatesAdded) {
        iceCandidatesAdded = _iceCandidatesAdded;
      }
    },
    _iceGatherer: {
      value: iceGatherer
    },
    _iceGatheringCompleted: {
      get: function() {
        return iceGatheringCompleted;
      },
      set: function(_iceGatheringCompleted) {
        iceGatheringCompleted = _iceGatheringCompleted;
      }
    },
    _iceTransport: {
      value: iceTransport
    },
    _localCandidates: {
      value: new Set()
    },
    _localDescription: {
      get: function() {
        return localDescription;
      },
      set: function(_localDescription) {
        localDescription = _localDescription;
      }
    },
    _localStreams: {
      value: new Set()
    },
    _midCounters: {
      value: {
        audio: 0,
        video: 0
      }
    },
    _remoteCandidates: {
      value: new Set()
    },
    _remoteDescription: {
      get: function() {
        return remoteDescription;
      },
      set: function(_remoteDescription) {
        remoteDescription = _remoteDescription;
      }
    },
    _remoteStreams: {
      value: []
    },
    _rtpReceivers: {
      value: new Map()
    },
    _rtpSenders: {
      value: new Map()
    },
    _signalingState: {
      get: function() {
        return signalingState;
      },
      set: function(_signalingState) {
        signalingState = _signalingState;
        if (this.onsignalingstatechange) {
          this.onsignalingstatechange();
        }
      }
    },
    _streamIds: {
      value: new Map()
    },
    iceConnectionState: {
      enumerable: true,
      get: function() {
        return iceTransport.state;
      }
    },
    iceGatheringState: {
      enumerable: true,
      get: function() {
        return iceGatheringCompleted ? 'gathering' : 'complete';
      }
    },
    localDescription: {
      enumerable: true,
      get: function() {
        return localDescription;
      }
    },
    onaddstream: {
      enumerable: true,
      get: function() {
        return onaddstream;
      },
      set: function(_onaddstream) {
        onaddstream = _onaddstream;
      }
    },
    onicecandidate: {
      enumerable: true,
      get: function() {
        return onicecandidate;
      },
      set: function(_onicecandidate) {
        onicecandidate = _onicecandidate;
        if (!onicecandidateWasSet) {
          try {
            iceGatherer.getLocalCandidates()
              .forEach(iceGatherer.onlocalcandidate);
          } catch (error) {
            // Do nothing.
          }
        }
        onicecandidateWasSet = true;
      }
    },
    oniceconnectionstatechange: {
      enumerable: true,
      get: function() {
        return oniceconnectionstatechange;
      },
      set: function(_oniceconnectionstatechange) {
        oniceconnectionstatechange = _oniceconnectionstatechange;
      }
    },
    onsignalingstatechange: {
      enumerable: true,
      get: function() {
        return onsignalingstatechange;
      },
      set: function(_onsignalingstatechange) {
        onsignalingstatechange = _onsignalingstatechange;
      }
    },
    remoteDescription: {
      enumerable: true,
      get: function() {
        return remoteDescription;
      }
    },
    signalingState: {
      enumerable: true,
      get: function() {
        return signalingState;
      }
    }
  });
}

RTCPeerConnection.prototype._makeMid = function _makeMid(kind) {
  return kind + ++this._midCounters[kind];
};

/**
 * This method is assigned to the {@link RTCDtlsTransport}'s "ondtlsstatechange" event handler.
 * @access private
 * @param {object} event
 */
RTCPeerConnection.prototype._ondtlsstatechange = function _ondtlsstatechange(event) {
  void event;
};

/**
 * This method is assigned to the {@link RTCIceTransport}'s "onicestatechange" event handler.
 * @access private
 * @param {object} event
 */
RTCPeerConnection.prototype._onicestatechange = function _onicestatechange(event) {
  if (this.oniceconnectionstatechange) {
    this.oniceconnectionstatechange(event);
  }
};

/**
 * This method is assigned to the {@link RTCIceGatherer}'s "onlocalcandidate" event handler.
 * @access private
 * @param {object} event
 */
RTCPeerConnection.prototype._onlocalcandidate = function _onlocalcandidate(event) {
  if (isEmptyObject(event.candidate)) {
    this._iceGatheringCompleted = true;
  }
  this._localCandidates.add(event.candidate);
  if (this.onicecandidate) {
    var webrtcCandidate = makeWebRTCCandidate(event.candidate);
    this.onicecandidate(makeOnIceCandidateEvent(webrtcCandidate));
  }
};

/**
 * Start sending RTP.
 * @access private
 * @param {MediaSection} mediaSection
 * @returns {this}
 */
RTCPeerConnection.prototype._sendRtp = function _sendRtp(mediaSection) {
  var kind = mediaSection.kind;
  // FIXME(mroberts): This is not right.
  this._rtpSenders.forEach(function(rtpSender) {
    if (rtpSender.track.kind !== kind) {
      return;
    }
    rtpSender.send(mediaSection.capabilities);
  }, this);
  return this;
};

/**
 * Start sending and receiving RTP for the given {@link MediaSection}s.
 * @access private
 * @param {Array<MediaSection>} mediaSections
 * @returns {this}
 */
RTCPeerConnection.prototype._sendAndReceiveRtp = function _sendAndReceiveRtp(mediaSections) {
  mediaSections.forEach(function(mediaSection) {
    if (mediaSection.direction === 'sendrecv' || mediaSection.direction === 'sendonly') {
      this._sendRtp(mediaSection);
    }
    if (mediaSection.direction === 'sendrecv' || mediaSection.direction === 'recvonly') {
    this._receiveRtp(mediaSection);
    }
  }, this);
  return this;
};

/**
 * Start receiving RTP.
 * @access private
 * @param {MediaSection} mediaSection
 * @returns {this}
 */
RTCPeerConnection.prototype._receiveRtp = function _receiveRtp(mediaSection) {
  var kind = mediaSection.capabilities.type;
  /* global RTCRtpReceiver:true */
  var rtpReceiver = new RTCRtpReceiver(this._dtlsTransport, kind);
  rtpReceiver.receive(mediaSection.capabilities);

  var track = rtpReceiver.track;
  this._rtpReceivers.set(track, rtpReceiver);

  // NOTE(mroberts): Without any source-level msid attribute, we are just
  // going to assume a one-to-one mapping between MediaStreams and
  // MediaStreamTracks.
  /* global MediaStream:true */
  var mediaStream = new MediaStream();
  mediaStream.addTrack(track);
  this._remoteStreams.push(mediaStream);

  if (this.onaddstream) {
    this.onaddstream(makeOnAddStreamEvent(mediaStream));
  }
  return this;
};

/**
 * Start the {@link RTCDtlsTransport}.
 * @access private
 * @param {RTCDtlsParameters} dtlsParameters - the remote DTLS parameters
 * @returns {this}
 */
RTCPeerConnection.prototype._startDtlsTransport = function _startDtlsTransport(dtlsParameters) {
  this._dtlsTransport.start(dtlsParameters);
  return this;
};

/**
 * Start the {@link RTCIceTransport}.
 * @access private
 * @param {RTCIceParameters} iceParameters - the remote ICE parameters
 * @returns {this}
 */
RTCPeerConnection.prototype._startIceTransport = function _startIceTransport(iceParameters) {
  var role = this.signalingState === 'have-local-offer'
    ? 'controlling'
    : 'controlled';
  this._iceTransport.start(this._iceGatherer, iceParameters, role);
  return this;
};

/**
 * Add an {@link RTCIceCandidate} to the {@link RTCPeerConnection}.
 * @param {RTCIceCandidate} candidate - the remote ICE candidate
 * @param {function} onSuccess
 * @param {function} onFailure
 *//**
 * Add an {@link RTCIceCandidate} to the {@link RTCPeerConnection}.
 * @param {RTCIceCandidate} candidate -the remote ICE candidate
 * @returns {Promise}
 */
RTCPeerConnection.prototype.addIceCandidate = function addIceCandidate(candidate, onSuccess, onFailure) {
  if (!onSuccess) {
    return new Promise(this.addIceCandidate.bind(this, candidate));
  }

  // NOTE(mroberts): I'm not sure there is a scenario where we'd ever call
  // onFailure.
  void onFailure;

  this._iceCandidatesAdded++;

  var ortcCandidate = makeORTCCandidate(candidate);

  // A candidate is identified by a triple of IP address, port, and protocol.
  // ORTC ICE candidates have no component ID, and so we need to deduplicate
  // the RTP and RTCP candidates when we're muxing.
  var triple =
    [ortcCandidate.ip, ortcCandidate.port, ortcCandidate.transport].join(' ');
  if (!this._remoteCandidates.has(triple)) {
    this._remoteCandidates.add(triple);
    this._iceTransport.addRemoteCandidate(ortcCandidate);
  }

  if (onSuccess) {
    onSuccess();
  }
};

/**
 * Add a {@link MediaStream} to the {@link RTCPeerConnection}.
 * @param {MediaStream} stream
 * @returns {void}
 */
RTCPeerConnection.prototype.addStream = function addStream(mediaStream) {
  this._localStreams.add(mediaStream);
  mediaStream.getTracks().forEach(function(track) {
    /* eslint no-invalid-this:0 */
    /* global RTCRtpSender:true */
    var rtpSender = new RTCRtpSender(track, this._dtlsTransport);
    this._rtpSenders.set(track, rtpSender);
    this._streamIds.set(track, mediaStream.id);
  }, this);
};

/**
 * Close the {@link RTCPeerConnection}.
 */
RTCPeerConnection.prototype.close = function close() {
  this._signalingState = 'closed';
  this._rtpReceivers.forEach(function(rtpReceiver) {
    rtpReceiver.stop();
  });
  this._dtlsTransport.stop();
  this._iceTransport.stop();
};

 /**
 * Construct an {@link RTCSessionDescription} containing an SDP offer.
 * @param {RTCSessionDescriptionCallback} onSuccess
 * @param {function} onFailure
 *//**
 * Construct an {@link RTCSessionDescription} containing an SDP offer.
 * @returns {Promise<RTCSessionDescription>}
 */
RTCPeerConnection.prototype.createAnswer = function createAnswer(onSuccess, onFailure) {
  if (typeof onSuccess !== 'function') {
    return new Promise(this.createAnswer.bind(this));
  }

  if (this.signalingState !== 'have-remote-offer') {
    return void onFailure(invalidSignalingState(this.signalingState));
  }

  // draft-ietf-rtcweb-jsep-11, Section 5.3.1:
  //
  //     The next step is to go through each offered m= section. If there is a
  //     local MediaStreamTrack of the same type which has been added to the
  //     PeerConnection via addStream and not yet associated with a m= section,
  //     and the specific m= section is either sendrecv or recvonly, the
  //     MediaStreamTrack will be associated with the m= section at this time.
  //     MediaStreamTracks are assigned using the canonical order described in
  //     Section 5.2.1.
  //
  var remote = sdpUtils.parseDescription(this.remoteDescription); // sdpTransform.parse(this.remoteDescription.sdp);
  var streams = this.getLocalStreams();
  var tracks = { audio: [], video: [] };
  streams.forEach(function(stream) {
    tracks.audio = tracks.audio.concat(stream.getAudioTracks());
    tracks.video = tracks.video.concat(stream.getVideoTracks());
  });
  var mediaSections = remote.mediaSections.map(function(remoteMediaSection) {
    var kind = remoteMediaSection.kind;
    var remoteDirection = remoteMediaSection.direction;

    var remoteCapabilities = remoteMediaSection.capabilities;
    var localCapabilities = RTCRtpSender.getCapabilities(kind);
    var sharedCodecs = intersectCodecs(remoteCapabilities.codecs,
      localCapabilities.codecs);
    var sharedCapabilities = { codecs: sharedCodecs };

    var capabilities = sharedCapabilities;
    var direction;
    var track;

    // RFC 3264, Section 6.1:
    //
    //     If the answerer has no media formats in common for a particular
    //     offered stream, the answerer MUST reject that media stream by
    //     setting the port to zero.
    //
    if (!sharedCodecs.length) {
      return remoteMediaSection.copyAndReject();
    }

    // RFC 3264, Section 6.1:
    //
    //     For streams marked as inactive in the answer, the list of media
    //     formats is constructed based on the offer. If the offer was
    //     sendonly, the list is constructed as if the answer were recvonly.
    //     Similarly, if the offer was recvonly, the list is constructed as if
    //     the answer were sendonly, and if the offer was sendrecv, the list is
    //     constructed as if the answer were sendrecv. If the offer was
    //     inactive, the list is constructed as if the offer were actually
    //     sendrecv and the answer were sendrecv.
    //
    if (remoteDirection === 'inactive'
      || remoteDirection === 'recvonly' && !tracks[kind].length)
    {
      direction = 'inactive';
    } else if (remoteDirection === 'recvonly') {
      track = tracks[kind].shift();
      direction = 'sendonly';
    } else if (remoteDirection === 'sendrecv') {
      track = tracks[kind].shift();
      direction = track ? 'sendrecv' : 'recvonly';
    } else { // sendonly
      direction = 'recvonly';
    }

    var streamId = this._streamIds.get(track);
    var mediaSection = remoteMediaSection.copy(null, null, capabilities,
      direction, null, streamId, track);
    return mediaSection;
  }, this);

  // FIXME(mroberts): We should probably provision an ICE transport for each
  // MediaSection in the event BUNDLE is not supported.
  mediaSections.forEach(function(mediaSection) {
    this._localCandidates.forEach(mediaSection.addCandidate, mediaSection);
  }, this);

  var sdp = sdpUtils.makeInitialSDPBlob();
  sdpUtils.addMediaSectionsToSDPBlob(sdp, mediaSections);
  sdpUtils.addIceParametersToSDPBlob(sdp, this._iceGatherer.getLocalParameters());
  sdpUtils.addDtlsParametersToSDPBlob(sdp, this._dtlsTransport.getLocalParameters());

  var description = new RTCSessionDescription({
    sdp: sdpTransform.write(sdp),
    type: 'answer'
  });

  onSuccess(description);
};

RTCPeerConnection.prototype.createDTMFSender = function createDTMFSender(track) {
  if (!this._dtmfSenders.has(track)) {
    var rtpSender = this._rtpSenders.get(track);
    /* global RTCDtmfSender:true */
    var dtmfSender = new RTCDtmfSender(rtpSender);
    this._dtmfSenders.set(track, dtmfSender);
  }
  return this._dtmfSenders.get(track);
};

 /**
 * Construct an {@link RTCSessionDescription} containing an SDP offer.
 * @param {RTCSessionDescriptionCallback} onSuccess
 * @param {function} onFailure
 * @param {?RTCOfferOptions} [options]
 *//**
 * Construct an {@link RTCSessionDescription} containing an SDP offer.
 * @param {?RTCOfferOptions} [options]
 * @returns {Promise<RTCSessionDescription>}
 */
RTCPeerConnection.prototype.createOffer = function createOffer(onSuccess, onFailure, options) {
  if (typeof onSuccess !== 'function') {
    return new Promise(function(resolve, reject) {
      this.createOffer(resolve, reject, onSuccess);
    }.bind(this));
  }

  // draft-ieft-rtcweb-jsep-11, Section 5.2.3:
  //
  //    If the 'OfferToReceiveAudio' option is specified, with an integer value
  //    of N, and M audio MediaStreamTracks have been added to the
  //    PeerConnection, the offer MUST include M non-rejected m= sections with
  //    media type 'audio', even if N is greater than M. ... the directional
  //    attribute on the N-M audio m= sections without associated
  //    MediaStreamTracks MUST be set to recvonly.
  //
  //    ...
  //
  //    For backwards compatibility with pre-standards versions of this
  //    specification, a value of 'true' is interpreted as equivalent to N=1,
  //    and 'false' as N=0.
  //
  var N = { audio: null, video: null };
  var M = { audio: 0,    video: 0    };
  options = options || {};
  ['optional', 'mandatory'].forEach(function(optionType) {
    if (!(optionType in options)) {
      return;
    }
    if ('OfferToReceiveAudio' in options[optionType]) {
      N.audio = Number(options[optionType].OfferToReceiveAudio);
    }
    if ('OfferToReceiveVideo' in options[optionType]) {
      N.video = Number(options[optionType].OfferToReceiveVideo);
    }
  });

  var mediaSections = [];

  // draft-ietf-rtcweb-jsep-11, Section 5.2.1:
  //
  //     m=sections MUST be sorted first by the order in which the MediaStreams
  //     were added to the PeerConnection, and then by the alphabetical
  //     ordering of the media type for the MediaStreamTrack.
  //
  var _N = { audio: N.audio, video: N.video };
  var streams = this.getLocalStreams();
  streams.forEach(function(stream) {
    var audioTracks = stream.getAudioTracks();
    var videoTracks = stream.getVideoTracks();
    M.audio += audioTracks.length;
    M.video += videoTracks.length;
    var tracks = audioTracks.concat(videoTracks);
    tracks.forEach(function(track) {
      var kind = track.kind;
      var capabilities = RTCRtpSender.getCapabilities(kind);
      var direction;
      var mid = this._makeMid(kind);
      if (_N.audio === null) {
        direction = 'sendrecv';
      } else if (!_N[kind]) {
        direction = 'sendonly';
      } else {
        _N[kind]--;
        direction = 'sendrecv';
      }
      var mediaSection = new MediaSection(null, null, capabilities, direction,
        kind, mid, null, null, stream.id, track);
      mediaSections.push(mediaSection);
    }, this);
  }, this);

  // Add the N-M recvonly m=sections.
  ['audio', 'video'].forEach(function(kind) {
    var k = Math.max(N[kind] - M[kind], 0);
    if (!k) {
      return;
    }
    var capabilities = RTCRtpSender.getCapabilities(kind);
    var direction = 'recvonly';
    var mid;
    var mediaSection;
    while (k--) {
      mid = this._makeMid(kind);
      mediaSection = new MediaSection(null, null, capabilities, direction,
        kind, mid);
      mediaSections.push(mediaSection);
    }
  }, this);

  // FIXME(mroberts): We should probably provision an ICE transport for each
  // MediaSection in the event BUNDLE is not supported.
  mediaSections.forEach(function(mediaSection) {
    this._localCandidates.forEach(mediaSection.addCandidate, mediaSection);
  }, this);

  var sdp = sdpUtils.makeInitialSDPBlob();
  sdpUtils.addMediaSectionsToSDPBlob(sdp, mediaSections);
  sdpUtils.addIceParametersToSDPBlob(sdp, this._iceGatherer.getLocalParameters());
  sdpUtils.addDtlsParametersToSDPBlob(sdp, this._dtlsTransport.getLocalParameters());

  var description = new RTCSessionDescription({
    sdp: sdpTransform.write(sdp),
    type: 'offer'
  });

  onSuccess(description);
};

/**
 * Get the {@link MediaStream}s that are currently or will be sent with this
 * {@link RTCPeerConnection}.
 * @returns {Array<MediaStream>}
 */
RTCPeerConnection.prototype.getLocalStreams = function getLocalStreams() {
  return Array.from(this._localStreams);
};

/**
 * Get the {@link MediaStreams} that are currently received by this
 * {@link RTCPeerConnection}.
 * @returns {Array<MediaStream>}
 */
RTCPeerConnection.prototype.getRemoteStreams = function getRemoteStreams() {
  return this._remoteStreams.slice();
};

/**
 * Remove a {@link MediaStream} from the {@link RTCPeerConnection}.
 * @param {MediaStream} stream
 * @returns {void}
 */
RTCPeerConnection.prototype.removeStream = function removeStream(mediaStream) {
  this._localStreams.delete(mediaStream);
  mediaStream.getTracks().forEach(function(track) {
    /* eslint no-invalid-this:0 */
    this._rtpSenders.get(track).stop();
    this._rtpSenders.delete(track);
    this._streamIds.delete(track);
  }, this);
};

/**
 * Apply the supplied {@link RTCSessionDescription} as the local description.
 * @param {RTCSessionDescription}
 * @param {function} onSuccess
 * @param {function} onFailure
 *//**
 * Apply the supplied {@link RTCSessionDescription} as the local description.
 * @param {RTCSessionDescription}
 * @returns {Promise}
 */
RTCPeerConnection.prototype.setLocalDescription = function setLocalDescription(description, onSuccess, onFailure) {
  if (!onSuccess) {
    return new Promise(this.setLocalDescription.bind(this, description));
  }

  var nextSignalingState;
  switch (this.signalingState) {
    case 'stable':
      nextSignalingState = 'have-local-offer';
      break;
    case 'have-remote-offer':
      nextSignalingState = 'stable';
      break;
    default:
      return void onFailure(invalidSignalingState(this.signalingState));
  }
  var parsed = sdpUtils.parseDescription(description);
  if (this.signalingState === 'have-remote-offer') {
    parsed.mediaSections.forEach(this._sendRtp, this);
    // FIXME(mroberts): ...
    var remote = sdpUtils.parseDescription(this.remoteDescription);
    var remoteSsrc = remote.mediaSections[0].capabilities.encodings[0].ssrc;
    parsed.mediaSections.forEach(function(mediaSection) {
      mediaSection.capabilities.encodings.forEach(function(encoding) {
        encoding.ssrc = remoteSsrc;
      });
      mediaSection.capabilities.rtcp.ssrc = remoteSsrc;
    });
    parsed.mediaSections.forEach(this._receiveRtp, this);
  }
  this._localDescription = description;
  this._signalingState = nextSignalingState;
  onSuccess();
};

/**
 * Apply the supplied {@link RTCSessionDescription} as the remote offer or answer.
 * @param {RTCSessionDescription}
 * @param {function} onSuccess
 * @param {function} onFailure
 *//**
 * Apply the supplied {@link RTCSessionDescription} as the remote offer or answer.
 * @param {RTCSessionDescription}
 * @returns {Promise}
 */
RTCPeerConnection.prototype.setRemoteDescription = function setRemoteDescription(description, onSuccess, onFailure) {
  if (!onSuccess) {
    return new Promise(this.setRemoteDescription.bind(this, description));
  }

  var nextSignalingState;
  switch (this.signalingState) {
    case 'stable':
      nextSignalingState = 'have-remote-offer';
      break;
    case 'have-local-offer':
      nextSignalingState = 'stable';
      break;
    default:
      return void onFailure(invalidSignalingState(this.signalingState));
  }
  var parsed = sdpUtils.parseDescription(description);

  if (this._iceTransport.state !== 'closed' &&
      this._iceTransport.state !== 'completed') {
    parsed.mediaSections.forEach(function(mediaSection) {
      mediaSection.candidates.forEach(this._iceTransport.addRemoteCandidate,
        this._iceTransport);
    }, this);
    this._startIceTransport(parsed.iceParameters[0]);
    this._startDtlsTransport(parsed.dtlsParameters[0]);
  }

  if (this.signalingState === 'have-local-offer') {
    parsed.mediaSections.forEach(this._receiveRtp, this);
    // FIXME(mroberts): ...
    parsed.mediaSections.forEach(this._sendRtp, this);
  }
  this._remoteDescription = description;
  this._signalingState = nextSignalingState;
  onSuccess();
};

/**
 * Construct an "invalid signaling state" {@link Error}.
 * @access private
 * @param {string} singalingState
 * @returns {Error}
 */
function invalidSignalingState(signalingState) {
  return new Error('Invalid signaling state: ' + signalingState);
}

/**
 * Check if an object is empty (i.e. the object contains no keys).
 * @access private
 * @param {object} object
 * @returns {boolean}
 */
function isEmptyObject(object) {
  return !Object.keys(object).length;
}

/**
 * Construct {@link RTCIceGatherOptions} from an {@link RTCConfiguration}.
 * @access private
 * @param {RTCConfiguration} configuration
 * @returns {RTCIceGatherOptions}
 */
function makeGatherOptions(configuration) {
  return {
    gatherPolicy: configuration.gatherPolicy || 'all',
    iceServers: []
  };
}

/**
 * Construct an "addstream" {@link MediaStreamEvent}.
 * @access private
 * @param {MediaStream} stream
 * @returns {MediaStreamEvent}
 */
function makeOnAddStreamEvent(stream) {
  return new MediaStreamEvent('addstream', {
    stream: stream
  });
}

/**
 * Construct an "icecandidate" {@link RTCPeerConnectionIceEvent}.
 * @access private
 * @param {RTCIceCandidate} candidate
 * @returns {RTCPeerConnectionIceEvent}
 */
function makeOnIceCandidateEvent(candidate) {
  return new RTCPeerConnectionIceEvent('icecandidate', {
    candidate: candidate
  });
}

/**
 * Construct an ORTC ICE candidate from a WebRTC ICE candidate.
 * @access private
 * @param {RTCIceCandidate} candidate - an WebRTC ICE candidate
 * @returns {RTCIceCanddidate}
 */
function makeORTCCandidate(candidate) {
  if (!candidate) {
    return {};
  }
  var start = candidate.candidate.indexOf('candidate:');
  var line = candidate.candidate
    .slice(start + 10)
    .replace(/ +/g, ' ')
    .split(' ');
  var ortcIceCandidate = {
    foundation: line[0],
    protocol: line[2],
    priority: parseInt(line[3]),
    ip: line[4],
    port: parseInt(line[5]),
    type: line[7],
    relatedAddress: null,
    relatedPort: 0,
    tcpType: 'active'
  };
  if (ortcIceCandidate.type !== 'host') {
    ortcIceCandidate.relatedAddress = line[9];
    ortcIceCandidate.relatedPort = parseInt(line[11]);
  }
  return ortcIceCandidate;
}

/**
 * Construct a WebRTC ICE candidate from an ORTC ICE candidate.
 * @access private
 * @param {RTCIceCandidate} candidate - an ORTC ICE candidate
 * @returns {RTCIceCandidate}
 */
function makeWebRTCCandidate(candidate) {
  if (isEmptyObject(candidate)) {
    return null;
  }
  var line = [
    'a=candidate',
    candidate.foundation,
    1,
    candidate.protocol,
    candidate.priority,
    candidate.ip,
    candidate.port,
    candidate.type
  ];
  if (candidate.relatedAddress) {
    line = line.concat([
      'raddr',
      candidate.relatedAddress,
      'rport',
      candidate.relatedPort
    ]);
  }
  line.push('generation 0');
  return new RTCIceCandidate({
    candidate: line.join(' '),
    sdpMLineIndex: 0
  });
}

/**
 * Intersect codecs.
 * @param {Array<object>} localCodecs
 * @param {Array<object>} remoteCodecs
 * @returns {Array<object>}
 */
function intersectCodecs(localCodecs, remoteCodecs) {
  var sharedCodecs = [];
  localCodecs.forEach(function(localCodec) {
    remoteCodecs.forEach(function(remoteCodec) {
      if (localCodec.name === remoteCodec.name &&
        localCodec.clockRate === remoteCodec.clockRate &&
        localCodec.numChannels === remoteCodec.numChannels)
      {
        sharedCodecs.push(remoteCodec);
      }
    });
  });
  return sharedCodecs;
}

module.exports = RTCPeerConnection;

},{"./mediasection":36,"./mediastreamevent":37,"./rtcicecandidate":38,"./rtcpeerconnectioniceevent":40,"./rtcsessiondescription":41,"./sdp-utils":42,"sdp-transform":44}],40:[function(require,module,exports){
'use strict';

/**
 * Construct an {@link RTCPeerConnectionIceEvent}.
 * @class
 * @classdesc
 * @extends Event
 * @param {string} type - "icecandidate"
 * @param {object} init
 * @property {MediaStream} stream
 */
function RTCPeerConnectionIceEvent(type, init) {
  if (!(this instanceof RTCPeerConnectionIceEvent)) {
    return new RTCPeerConnectionIceEvent(type, init);
  }
  Event.call(this, type, init);
  Object.defineProperties(this, {
    candidate: {
      enumerable: true,
      value: init.candidate
    }
  });
}

module.exports = RTCPeerConnectionIceEvent;

},{}],41:[function(require,module,exports){
'use strict';

/**
 * Construct an {@link RTCSessionDescription}.
 * @class
 * @classdesc
 * @param {object} description
 * @property {string} sdp
 * @property {string} type - one of "offer" or "answer"
 */
function RTCSessionDescription(description) {
  if (!(this instanceof RTCSessionDescription)) {
    return new RTCSessionDescription(description);
  }
  Object.defineProperties(this, {
    sdp: {
      enumerable: true,
      value: description.sdp
    },
    type: {
      enumerable: true,
      value: description.type
    }
  });
}

module.exports = RTCSessionDescription;

},{}],42:[function(require,module,exports){
'use strict';

var MediaSection = require('./mediasection');
var sdpTransform = require('sdp-transform');

/**
 * Add ICE candidates to an arbitrary level of an SDP blob.
 * @param {?object} [level={}]
 * @param {?Array<RTCIceCandidate>} [candidates]
 * @param {?number} [component] - if unspecified, add both RTP and RTCP candidates
 * @returns {object}
 */
function addCandidatesToLevel(level, candidates, component) {
  level = level || {};
  level.candidates = level.candidates || [];
  if (!candidates) {
    return level;
  }
  candidates.forEach(function(candidate) {
    // TODO(mroberts): Empty dictionary check.
    if (!candidate.foundation) {
      level.endOfCandidates = 'end-of-candidates';
      return;
    }
    var candidate1 = {
      foundation: candidate.foundation,
      transport: candidate.protocol,
      priority: candidate.priority,
      ip: candidate.ip,
      port: candidate.port,
      type: candidate.type,
      generation: 0
    };
    if (candidate.relatedAddress) {
      candidate1.raddr = candidate.relatedAddress;
      candidate1.rport = candidate.relatedPort;
    }

    if (typeof component === 'number') {
      candidate1.component = component;
      level.candidates.push(candidate1);
      return;
    }

    // RTP candidate
    candidate1.component = 1;
    level.candidates.push(candidate1);

    // RTCP candidate
    var candidate2 = {};
    for (var key in candidate1) {
      candidate2[key] = candidate1[key];
    }
    candidate2.component = 2;
    level.candidates.push(candidate2);
  });
  return level;
}

/**
 * Add ICE candidates to the media-levels of an SDP blob. Since this adds to
 * the media-levels, you should call this after you have added all your media.
 * @param {?object} [sdp={}]
 * @param {?Array<RTCIceCandidate>} [candidates]
 * @param {?number} [component] - if unspecified, add both RTP and RTCP candidates
 * @returns {object}
 */
function addCandidatesToMediaLevels(sdp, candidates, component) {
  sdp = sdp || {};
  if (!sdp.media) {
    return sdp;
  }
  sdp.media.forEach(function(media) {
    addCandidatesToLevel(media, candidates, component);
  });
  return sdp;
}

/**
 * Add ICE candidates to the media-levels of an SDP blob. Since
 * this adds to the media-levels, you should call this after you have added
 * all your media.
 * @param {?object} [sdp={}]
 * @param {?Array<RTCIceCandidate>} [candidates]
 * @param {?number} [component] - if unspecified, add both RTP and RTCP candidates
 * @returns {object}
 */
function addCandidatesToSDPBlob(sdp, candidates, component) {
  sdp = sdp || {};
  // addCandidatesToSessionLevel(sdp, candidates, component);
  addCandidatesToMediaLevels(sdp, candidates, component);
  return sdp;
}

/**
 * Add the DTLS fingerprint to the media-levels of an SDP blob.
 * Since this adds to media-levels, you should call this after you have added
 * all your media.
 * @param {?object} [sdp={}]
 * @param {RTCDtlsParameters} dtlsParameters
 * @returns {object}
 */
function addDtlsParametersToSDPBlob(sdp, dtlsParameters) {
  sdp = sdp || {};
  // addDtlsParametersToSessionLevel(sdp, dtlsParameters);
  addDtlsParametersToMediaLevels(sdp, dtlsParameters);
  return sdp;
}

/**
 * Add the DTLS fingerprint to an arbitrary level of an SDP blob.
 * @param {?object} [sdp={}]
 * @param {RTCDtlsParameters} dtlsParameters
 * @returns {object}
 */
function addDtlsParametersToLevel(level, dtlsParameters) {
  level = level || {};
  var fingerprints = dtlsParameters.fingerprints;
  if (fingerprints.length) {
    level.fingerprint = {
      type: fingerprints[0].algorithm,
      hash: fingerprints[0].value
    };
  }
  return level;
}

/**
 * Add the DTLS fingerprint to the media-levels of an SDP blob. Since this adds
 * to the media-levels, you should call this after you have added all of your
 * media.
 * @param {?object} [sdp={}]
 * @param {RTCDtlsParameters} dtlsParameters
 * @returns {object}
 */
function addDtlsParametersToMediaLevels(sdp, dtlsParameters) {
  sdp = sdp || {};
  if (!sdp.media) {
    return sdp;
  }
  sdp.media.forEach(function(media) {
    addDtlsParametersToLevel(media, dtlsParameters);
  });
  return sdp;
}

/**
 * Add the ICE username fragment and password to the media-levels
 * of an SDP blob. Since this adds to media-levels, you should call this after
 * you have added all your media.
 * @param {?object} [sdp={}]
 * @param {RTCIceParameters} parameters
 * @returns {object}
 */
function addIceParametersToSDPBlob(sdp, iceParameters) {
  sdp = sdp || {};
  // addIceParametersToSessionLevel(sdp, iceParameters);
  addIceParametersToMediaLevels(sdp, iceParameters);
  return sdp;
}

/**
 * Add the ICE username fragment and password to the media-levels of an SDP
 * blob. Since this adds to media-levels, you should call this after you have
 * added all your media.
 * @param {?object} [sdp={}]
 * @param {RTCIceParameters} iceParameters
 * @returns {object}
 */
function addIceParametersToMediaLevels(sdp, iceParameters) {
  sdp = sdp || {};
  if (!sdp.media) {
    return sdp;
  }
  sdp.media.forEach(function(media) {
    addIceParametersToLevel(media, iceParameters);
  });
  return sdp;
}

/**
 * Add the ICE username fragment and password to an arbitrary level of an SDP
 * blob.
 * @param {?object} [level={}]
 * @param {RTCIceParameters} iceParameters
 * @returns {object}
 */
function addIceParametersToLevel(level, iceParameters) {
  level = level || {};
  level.iceUfrag = iceParameters.usernameFragment;
  level.icePwd = iceParameters.password;
  return level;
}

/**
 * Add a {@link MediaSection} to an SDP blob.
 * @param {object} sdp
 * @param {MediaSection} mediaSection
 * @returns {object}
 */
function addMediaSectionToSDPBlob(sdp, mediaSection) {
  var streamId = mediaSection.streamId;
  if (streamId) {
    sdp.msidSemantic = sdp.msidSemantic || {
      semantic: 'WMS',
      token: []
    };
    sdp.msidSemantic.token.push(streamId);
  }

  var mid = mediaSection.mid;
  if (mid) {
    sdp.groups = sdp.groups || [];
    var foundBundle = false;
    sdp.groups.forEach(function(group) {
      if (group.type === 'BUNDLE') {
        group.mids.push(mid);
        foundBundle = true;
      }
    });
    if (!foundBundle) {
      sdp.groups.push({
        type: 'BUNDLE',
        mids: [mid]
      });
    }
  }

  var payloads = [];
  var rtps = [];
  var fmtps = [];
  mediaSection.capabilities.codecs.forEach(function(codec) {
    var payload = codec.preferredPayloadType;
    payloads.push(payload);
    var rtp = {
      payload: payload,
      codec: codec.name,
      rate: codec.clockRate
    };
    if (codec.numChannels > 1) {
      rtp.encoding = codec.numChannels;
    }
    rtps.push(rtp);
    switch (codec.name) {
      case 'telephone-event':
        if (codec.parameters && codec.parameters.events) {
          fmtps.push({
            payload: payload,
            config: codec.parameters.events
          });
        }
        break;
    }
  });

  var ssrcs = [];
  if (streamId && mediaSection.track) {
    var ssrc = Math.floor(Math.random() * 4294967296);
    var cname = makeCname();
    var trackId = mediaSection.track.id;
    ssrcs = ssrcs.concat([
      {
        id: ssrc,
        attribute: 'cname',
        value: cname
      },
      {
        id: ssrc,
        attribute: 'msid',
        value: mediaSection.streamId + ' ' + trackId
      },
      {
        id: ssrc,
        attribute: 'mslabel',
        value: trackId
      },
      {
        id: ssrc,
        attribute: 'label',
        value: trackId
      }
    ]);
  }

  // draft-ietf-rtcweb-jsep-11, Section 5.2.2:
  //
  //     Each "m=" and c=" line MUST be filled in with the port, protocol,
  //     and address of the default candidate for the m= section, as
  //     described in [RFC5245], Section 4.3.  Each "a=rtcp" attribute line
  //     MUST also be filled in with the port and address of the
  //     appropriate default candidate, either the default RTP or RTCP
  //     candidate, depending on whether RTCP multiplexing is currently
  //     active or not.
  //
  var defaultCandidate = mediaSection.defaultCandidate;

  var media = {
    rtp: rtps,
    fmtp: fmtps,
    type: mediaSection.kind,
    port: defaultCandidate ? defaultCandidate.port : 9,
    payloads: payloads.join(' '),
    protocol: 'RTP/SAVPF',
    direction: mediaSection.direction,
    connection: {
      version: 4,
      ip: defaultCandidate ? defaultCandidate.ip : '0.0.0.0'
    },
    rtcp: {
      port: defaultCandidate ? defaultCandidate.port : 9,
      netType: 'IN',
      ipVer: 4,
      address: defaultCandidate ? defaultCandidate.ip : '0.0.0.0'
    },
    ssrcs: ssrcs
  };
  if (mid) {
    media.mid = mid;
  }
  if (mediaSection.rtcpMux) {
    media.rtcpMux = 'rtcp-mux';
  }
  addCandidatesToLevel(media, mediaSection.candidates);
  sdp.media.push(media);
  return sdp;
}

function addMediaSectionsToSDPBlob(sdp, mediaSections) {
  mediaSections.forEach(addMediaSectionToSDPBlob.bind(null, sdp));
  return sdp;
}

/**
 * Construct an initial SDP blob.
 * @param {?number} [sessionId]
 * @returns {object}
 */
function makeInitialSDPBlob(sessionId) {
  sessionId = sessionId || Math.floor(Math.random() * 4294967296);
  return {
    version: 0,
    origin: {
      username: '-',
      sessionId: sessionId,
      sessionVersion: 0,
      netType: 'IN',
      ipVer: 4,
      address: '127.0.0.1'
    },
    name: '-',
    timing: {
      start: 0,
      stop: 0
    },
    connection: {
      version: 4,
      ip: '0.0.0.0'
    },
    media: []
  };
}

/**
 * Parse the SDP contained in an {@link RTCSessionDescription} into individual
 * {@link RTCIceParameters}, {@link RTCDtlsParameters}, and
 * {@link RTCRtpParameters}.
 * @access private
 * @param {RTCSessionDescription} description
 * @returns {object}
 */
function parseDescription(description) {
  var sdp = sdpTransform.parse(description.sdp);

  var iceParameters = [];
  var dtlsParameters = [];
  var candidates = [];
  var mediaSections = [];

  var levels = [sdp];
  if (sdp.media) {
    levels = levels.concat(sdp.media);
  }

  levels.forEach(function(level) {
    // ICE and DTLS parameters may appear at the session- or media-levels.
    if (level.iceUfrag && level.icePwd && level.fingerprint) {
      iceParameters.push({
        usernameFragment: level.iceUfrag,
        password: level.icePwd
      });
      dtlsParameters.push({
        fingerprints: [
          {
            algorithm: level.fingerprint.type,
            value: level.fingerprint.hash
          }
        ]
      });
    }

    // RTP parameters appear at the media-level.
    if (level.rtp) {
      if (level.type === 'video') {
        return;
      }
      var address = level.connection ? level.connection.ip : null;
      // var candidates;
      var direction = level.direction;
      var kind = level.type;
      var mid = level.mid;
      var port = level.port || null;
      var rtcpMux = level.rtcpMux === 'rtcp-mux';

      var cname;
      var ssrc;
      var streamId;
      // var trackId;
      // FIXME(mroberts): This breaks with multiple SSRCs.
      (level.ssrcs || []).forEach(function(attribute) {
        switch (attribute.attribute) {
          case 'cname':
            ssrc = attribute.id;
            cname = attribute.value;
            break;
          case 'label':
          case 'mslabel':
            ssrc = attribute.id;
            // trackId = attribute.value;
            break;
          case 'msid':
            ssrc = attribute.id;
            streamId = attribute.value.split(' ')[0];
            break;
        }
      });

      var capabilities = {
        type: kind,
        muxId: mid,
        codecs: level.rtp.map(function(rtp) {
          var codec = {
            name: rtp.codec,
            payloadType: parseInt(rtp.payload),
            clockRate: parseInt(rtp.rate),
            numChannels: rtp.encoding || 1,
            rtcpFeedback: [],
            parameters: {}
          };
          switch (rtp.codec) {
            case 'telephone-event':
              codec.parameters.events = '0-16';
              break;
          }
          return codec;
        }),
        headerExtensions: [],
        encodings: level.rtp.map(function(rtp) {
          return {
            ssrc: ssrc,
            codecPayloadType: parseInt(rtp.payload),
            active: true
          };
        }),
        rtcp: {
          ssrc: ssrc,
          cname: cname,
          mux: rtcpMux
        }
      };

      var mediaSection = new MediaSection(address, candidates, capabilities,
        direction, kind, mid, port, rtcpMux, streamId);

      (level.candidates || []).forEach(function(candidate) {
        var ortcCandidate = {
          foundation: String(candidate.foundation),
          protocol: candidate.transport,
          priority: candidate.priority,
          ip: candidate.ip,
          port: candidate.port,
          type: candidate.type,
          relatedAddress: candidate.raddr,
          relatedPort: candidate.rport
        };
        candidates.push(ortcCandidate);
        mediaSection.addCandidate(ortcCandidate);
      });

      void candidates;

      if (level.endOfCandidates === 'end-of-candidates') {
        mediaSection.addCandidate({});
      }

      mediaSections.push(mediaSection);
    }
  });

  return {
    iceParameters: iceParameters,
    dtlsParameters: dtlsParameters,
    mediaSections: mediaSections
  };
}

function makeCname() {
  var a = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/'.split('');
  var n = 16;
  var cname = '';
  while (n--) {
    cname += a[Math.floor(Math.random() * a.length)];
  }
  return cname;
}

module.exports.addCandidatesToSDPBlob = addCandidatesToSDPBlob;
module.exports.addDtlsParametersToSDPBlob = addDtlsParametersToSDPBlob;
module.exports.addIceParametersToSDPBlob = addIceParametersToSDPBlob;
module.exports.addMediaSectionsToSDPBlob = addMediaSectionsToSDPBlob;
module.exports.makeInitialSDPBlob = makeInitialSDPBlob;
module.exports.parseDescription = parseDescription;

},{"./mediasection":36,"sdp-transform":44}],43:[function(require,module,exports){
var grammar = module.exports = {
  v: [{
      name: 'version',
      reg: /^(\d*)$/
  }],
  o: [{ //o=- 20518 0 IN IP4 203.0.113.1
    // NB: sessionId will be a String in most cases because it is huge
    name: 'origin',
    reg: /^(\S*) (\d*) (\d*) (\S*) IP(\d) (\S*)/,
    names: ['username', 'sessionId', 'sessionVersion', 'netType', 'ipVer', 'address'],
    format: "%s %s %d %s IP%d %s"
  }],
  // default parsing of these only (though some of these feel outdated)
  s: [{ name: 'name' }],
  i: [{ name: 'description' }],
  u: [{ name: 'uri' }],
  e: [{ name: 'email' }],
  p: [{ name: 'phone' }],
  z: [{ name: 'timezones' }], // TODO: this one can actually be parsed properly..
  r: [{ name: 'repeats' }],   // TODO: this one can also be parsed properly
  //k: [{}], // outdated thing ignored
  t: [{ //t=0 0
    name: 'timing',
    reg: /^(\d*) (\d*)/,
    names: ['start', 'stop'],
    format: "%d %d"
  }],
  c: [{ //c=IN IP4 10.47.197.26
      name: 'connection',
      reg: /^IN IP(\d) (\S*)/,
      names: ['version', 'ip'],
      format: "IN IP%d %s"
  }],
  b: [{ //b=AS:4000
      push: 'bandwidth',
      reg: /^(TIAS|AS|CT|RR|RS):(\d*)/,
      names: ['type', 'limit'],
      format: "%s:%s"
  }],
  m: [{ //m=video 51744 RTP/AVP 126 97 98 34 31
      // NB: special - pushes to session
      // TODO: rtp/fmtp should be filtered by the payloads found here?
      reg: /^(\w*) (\d*) ([\w\/]*)(?: (.*))?/,
      names: ['type', 'port', 'protocol', 'payloads'],
      format: "%s %d %s %s"
  }],
  a: [
    { //a=rtpmap:110 opus/48000/2
      push: 'rtp',
      reg: /^rtpmap:(\d*) ([\w\-\.]*)(?:\s*\/(\d*)(?:\s*\/(\S*))?)?/,
      names: ['payload', 'codec', 'rate', 'encoding'],
      format: function (o) {
        return (o.encoding) ?
          "rtpmap:%d %s/%s/%s":
          o.rate ?
          "rtpmap:%d %s/%s":
          "rtpmap:%d %s";
      }
    },
    {
      //a=fmtp:108 profile-level-id=24;object=23;bitrate=64000
      //a=fmtp:111 minptime=10; useinbandfec=1
      push: 'fmtp',
      reg: /^fmtp:(\d*) ([\S| ]*)/,
      names: ['payload', 'config'],
      format: "fmtp:%d %s"
    },
    { //a=control:streamid=0
        name: 'control',
        reg: /^control:(.*)/,
        format: "control:%s"
    },
    { //a=rtcp:65179 IN IP4 193.84.77.194
      name: 'rtcp',
      reg: /^rtcp:(\d*)(?: (\S*) IP(\d) (\S*))?/,
      names: ['port', 'netType', 'ipVer', 'address'],
      format: function (o) {
        return (o.address != null) ?
          "rtcp:%d %s IP%d %s":
          "rtcp:%d";
      }
    },
    { //a=rtcp-fb:98 trr-int 100
      push: 'rtcpFbTrrInt',
      reg: /^rtcp-fb:(\*|\d*) trr-int (\d*)/,
      names: ['payload', 'value'],
      format: "rtcp-fb:%d trr-int %d"
    },
    { //a=rtcp-fb:98 nack rpsi
      push: 'rtcpFb',
      reg: /^rtcp-fb:(\*|\d*) ([\w-_]*)(?: ([\w-_]*))?/,
      names: ['payload', 'type', 'subtype'],
      format: function (o) {
        return (o.subtype != null) ?
          "rtcp-fb:%s %s %s":
          "rtcp-fb:%s %s";
      }
    },
    { //a=extmap:2 urn:ietf:params:rtp-hdrext:toffset
      //a=extmap:1/recvonly URI-gps-string
      push: 'ext',
      reg: /^extmap:([\w_\/]*) (\S*)(?: (\S*))?/,
      names: ['value', 'uri', 'config'], // value may include "/direction" suffix
      format: function (o) {
        return (o.config != null) ?
          "extmap:%s %s %s":
          "extmap:%s %s";
      }
    },
    {
      //a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:PS1uQCVeeCFCanVmcjkpPywjNWhcYD0mXXtxaVBR|2^20|1:32
      push: 'crypto',
      reg: /^crypto:(\d*) ([\w_]*) (\S*)(?: (\S*))?/,
      names: ['id', 'suite', 'config', 'sessionConfig'],
      format: function (o) {
        return (o.sessionConfig != null) ?
          "crypto:%d %s %s %s":
          "crypto:%d %s %s";
      }
    },
    { //a=setup:actpass
      name: 'setup',
      reg: /^setup:(\w*)/,
      format: "setup:%s"
    },
    { //a=mid:1
      name: 'mid',
      reg: /^mid:([^\s]*)/,
      format: "mid:%s"
    },
    { //a=msid:0c8b064d-d807-43b4-b434-f92a889d8587 98178685-d409-46e0-8e16-7ef0db0db64a
      name: 'msid',
      reg: /^msid:(.*)/,
      format: "msid:%s"
    },
    { //a=ptime:20
      name: 'ptime',
      reg: /^ptime:(\d*)/,
      format: "ptime:%d"
    },
    { //a=maxptime:60
      name: 'maxptime',
      reg: /^maxptime:(\d*)/,
      format: "maxptime:%d"
    },
    { //a=sendrecv
      name: 'direction',
      reg: /^(sendrecv|recvonly|sendonly|inactive)/
    },
    { //a=ice-lite
      name: 'icelite',
      reg: /^(ice-lite)/
    },
    { //a=ice-ufrag:F7gI
      name: 'iceUfrag',
      reg: /^ice-ufrag:(\S*)/,
      format: "ice-ufrag:%s"
    },
    { //a=ice-pwd:x9cml/YzichV2+XlhiMu8g
      name: 'icePwd',
      reg: /^ice-pwd:(\S*)/,
      format: "ice-pwd:%s"
    },
    { //a=fingerprint:SHA-1 00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33
      name: 'fingerprint',
      reg: /^fingerprint:(\S*) (\S*)/,
      names: ['type', 'hash'],
      format: "fingerprint:%s %s"
    },
    {
      //a=candidate:0 1 UDP 2113667327 203.0.113.1 54400 typ host
      //a=candidate:1162875081 1 udp 2113937151 192.168.34.75 60017 typ host generation 0 network-id 3 network-cost 10
      //a=candidate:3289912957 2 udp 1845501695 193.84.77.194 60017 typ srflx raddr 192.168.34.75 rport 60017 generation 0 network-id 3 network-cost 10
      //a=candidate:229815620 1 tcp 1518280447 192.168.150.19 60017 typ host tcptype active generation 0 network-id 3 network-cost 10
      //a=candidate:3289912957 2 tcp 1845501695 193.84.77.194 60017 typ srflx raddr 192.168.34.75 rport 60017 tcptype passive generation 0 network-id 3 network-cost 10
      push:'candidates',
      reg: /^candidate:(\S*) (\d*) (\S*) (\d*) (\S*) (\d*) typ (\S*)(?: raddr (\S*) rport (\d*))?(?: tcptype (\S*))?(?: generation (\d*))?(?: network-id (\d*))?(?: network-cost (\d*))?/,
      names: ['foundation', 'component', 'transport', 'priority', 'ip', 'port', 'type', 'raddr', 'rport', 'tcptype', 'generation', 'network-id', 'network-cost'],
      format: function (o) {
        var str = "candidate:%s %d %s %d %s %d typ %s";

        str += (o.raddr != null) ? " raddr %s rport %d" : "%v%v";

        // NB: candidate has three optional chunks, so %void middles one if it's missing
        str += (o.tcptype != null) ? " tcptype %s" : "%v";

        if (o.generation != null) {
          str += " generation %d";
        }

        str += (o['network-id'] != null) ? " network-id %d" : "%v";
        str += (o['network-cost'] != null) ? " network-cost %d" : "%v";
        return str;
      }
    },
    { //a=end-of-candidates (keep after the candidates line for readability)
      name: 'endOfCandidates',
      reg: /^(end-of-candidates)/
    },
    { //a=remote-candidates:1 203.0.113.1 54400 2 203.0.113.1 54401 ...
      name: 'remoteCandidates',
      reg: /^remote-candidates:(.*)/,
      format: "remote-candidates:%s"
    },
    { //a=ice-options:google-ice
      name: 'iceOptions',
      reg: /^ice-options:(\S*)/,
      format: "ice-options:%s"
    },
    { //a=ssrc:2566107569 cname:t9YU8M1UxTF8Y1A1
      push: "ssrcs",
      reg: /^ssrc:(\d*) ([\w_]*)(?::(.*))?/,
      names: ['id', 'attribute', 'value'],
      format: function (o) {
        var str = "ssrc:%d";
        if (o.attribute != null) {
          str += " %s";
          if (o.value != null) {
            str += ":%s";
          }
        }
        return str;
      }
    },
    { //a=ssrc-group:FEC 1 2
      push: "ssrcGroups",
      reg: /^ssrc-group:(\w*) (.*)/,
      names: ['semantics', 'ssrcs'],
      format: "ssrc-group:%s %s"
    },
    { //a=msid-semantic: WMS Jvlam5X3SX1OP6pn20zWogvaKJz5Hjf9OnlV
      name: "msidSemantic",
      reg: /^msid-semantic:\s?(\w*) (\S*)/,
      names: ['semantic', 'token'],
      format: "msid-semantic: %s %s" // space after ":" is not accidental
    },
    { //a=group:BUNDLE audio video
      push: 'groups',
      reg: /^group:(\w*) (.*)/,
      names: ['type', 'mids'],
      format: "group:%s %s"
    },
    { //a=rtcp-mux
      name: 'rtcpMux',
      reg: /^(rtcp-mux)/
    },
    { //a=rtcp-rsize
      name: 'rtcpRsize',
      reg: /^(rtcp-rsize)/
    },
    { //a=sctpmap:5000 webrtc-datachannel 1024
      name: 'sctpmap',
      reg: /^sctpmap:([\w_\/]*) (\S*)(?: (\S*))?/,
      names: ['sctpmapNumber', 'app', 'maxMessageSize'],
      format: function (o) {
        return (o.maxMessageSize != null) ?
          "sctpmap:%s %s %s" :
          "sctpmap:%s %s";
      }
    },
    { // any a= that we don't understand is kepts verbatim on media.invalid
      push: 'invalid',
      names: ["value"]
    }
  ]
};

// set sensible defaults to avoid polluting the grammar with boring details
Object.keys(grammar).forEach(function (key) {
  var objs = grammar[key];
  objs.forEach(function (obj) {
    if (!obj.reg) {
      obj.reg = /(.*)/;
    }
    if (!obj.format) {
      obj.format = "%s";
    }
  });
});

},{}],44:[function(require,module,exports){
var parser = require('./parser');
var writer = require('./writer');

exports.write = writer;
exports.parse = parser.parse;
exports.parseFmtpConfig = parser.parseFmtpConfig;
exports.parsePayloads = parser.parsePayloads;
exports.parseRemoteCandidates = parser.parseRemoteCandidates;

},{"./parser":45,"./writer":46}],45:[function(require,module,exports){
var toIntIfInt = function (v) {
  return String(Number(v)) === v ? Number(v) : v;
};

var attachProperties = function (match, location, names, rawName) {
  if (rawName && !names) {
    location[rawName] = toIntIfInt(match[1]);
  }
  else {
    for (var i = 0; i < names.length; i += 1) {
      if (match[i+1] != null) {
        location[names[i]] = toIntIfInt(match[i+1]);
      }
    }
  }
};

var parseReg = function (obj, location, content) {
  var needsBlank = obj.name && obj.names;
  if (obj.push && !location[obj.push]) {
    location[obj.push] = [];
  }
  else if (needsBlank && !location[obj.name]) {
    location[obj.name] = {};
  }
  var keyLocation = obj.push ?
    {} :  // blank object that will be pushed
    needsBlank ? location[obj.name] : location; // otherwise, named location or root

  attachProperties(content.match(obj.reg), keyLocation, obj.names, obj.name);

  if (obj.push) {
    location[obj.push].push(keyLocation);
  }
};

var grammar = require('./grammar');
var validLine = RegExp.prototype.test.bind(/^([a-z])=(.*)/);

exports.parse = function (sdp) {
  var session = {}
    , media = []
    , location = session; // points at where properties go under (one of the above)

  // parse lines we understand
  sdp.split(/(\r\n|\r|\n)/).filter(validLine).forEach(function (l) {
    var type = l[0];
    var content = l.slice(2);
    if (type === 'm') {
      media.push({rtp: [], fmtp: []});
      location = media[media.length-1]; // point at latest media line
    }

    for (var j = 0; j < (grammar[type] || []).length; j += 1) {
      var obj = grammar[type][j];
      if (obj.reg.test(content)) {
        return parseReg(obj, location, content);
      }
    }
  });

  session.media = media; // link it up
  return session;
};

var fmtpReducer = function (acc, expr) {
  var s = expr.split(/=(.+)/, 2);
  if (s.length === 2) {
    acc[s[0]] = toIntIfInt(s[1]);
  }
  return acc;
};

exports.parseFmtpConfig = function (str) {
  return str.split(/\;\s?/).reduce(fmtpReducer, {});
};

exports.parsePayloads = function (str) {
  return str.split(' ').map(Number);
};

exports.parseRemoteCandidates = function (str) {
  var candidates = [];
  var parts = str.split(' ').map(toIntIfInt);
  for (var i = 0; i < parts.length; i += 3) {
    candidates.push({
      component: parts[i],
      ip: parts[i + 1],
      port: parts[i + 2]
    });
  }
  return candidates;
};

},{"./grammar":43}],46:[function(require,module,exports){
var grammar = require('./grammar');

// customized util.format - discards excess arguments and can void middle ones
var formatRegExp = /%[sdv%]/g;
var format = function (formatStr) {
  var i = 1;
  var args = arguments;
  var len = args.length;
  return formatStr.replace(formatRegExp, function (x) {
    if (i >= len) {
      return x; // missing argument
    }
    var arg = args[i];
    i += 1;
    switch (x) {
      case '%%':
        return '%';
      case '%s':
        return String(arg);
      case '%d':
        return Number(arg);
      case '%v':
        return '';
    }
  });
  // NB: we discard excess arguments - they are typically undefined from makeLine
};

var makeLine = function (type, obj, location) {
  var str = obj.format instanceof Function ?
    (obj.format(obj.push ? location : location[obj.name])) :
    obj.format;

  var args = [type + '=' + str];
  if (obj.names) {
    for (var i = 0; i < obj.names.length; i += 1) {
      var n = obj.names[i];
      if (obj.name) {
        args.push(location[obj.name][n]);
      }
      else { // for mLine and push attributes
        args.push(location[obj.names[i]]);
      }
    }
  }
  else {
    args.push(location[obj.name]);
  }
  return format.apply(null, args);
};

// RFC specified order
// TODO: extend this with all the rest
var defaultOuterOrder = [
  'v', 'o', 's', 'i',
  'u', 'e', 'p', 'c',
  'b', 't', 'r', 'z', 'a'
];
var defaultInnerOrder = ['i', 'c', 'b', 'a'];


module.exports = function (session, opts) {
  opts = opts || {};
  // ensure certain properties exist
  if (session.version == null) {
    session.version = 0; // "v=0" must be there (only defined version atm)
  }
  if (session.name == null) {
    session.name = " "; // "s= " must be there if no meaningful name set
  }
  session.media.forEach(function (mLine) {
    if (mLine.payloads == null) {
      mLine.payloads = "";
    }
  });

  var outerOrder = opts.outerOrder || defaultOuterOrder;
  var innerOrder = opts.innerOrder || defaultInnerOrder;
  var sdp = [];

  // loop through outerOrder for matching properties on session
  outerOrder.forEach(function (type) {
    grammar[type].forEach(function (obj) {
      if (obj.name in session && session[obj.name] != null) {
        sdp.push(makeLine(type, obj, session));
      }
      else if (obj.push in session && session[obj.push] != null) {
        session[obj.push].forEach(function (el) {
          sdp.push(makeLine(type, obj, el));
        });
      }
    });
  });

  // then for each media line, follow the innerOrder
  session.media.forEach(function (mLine) {
    sdp.push(makeLine('m', grammar.m[0], mLine));

    innerOrder.forEach(function (type) {
      grammar[type].forEach(function (obj) {
        if (obj.name in mLine && mLine[obj.name] != null) {
          sdp.push(makeLine(type, obj, mLine));
        }
        else if (obj.push in mLine && mLine[obj.push] != null) {
          mLine[obj.push].forEach(function (el) {
            sdp.push(makeLine(type, obj, el));
          });
        }
      });
    });
  });

  return sdp.join('\r\n') + '\r\n';
};

},{"./grammar":43}],47:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],48:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],49:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

},{"./support/isBuffer":48,"inherits":47}],50:[function(require,module,exports){
exports.XMLHttpRequest = XMLHttpRequest;

},{}]},{},[1]);
