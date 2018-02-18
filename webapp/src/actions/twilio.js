import axios from 'axios';
import { incomingCallEvent, callCanceledEvent } from "./phone";

// These are actions specifically related to setting up and managing the twilio device

/*
 Action Types
 */

export const TWILIO_SCRIPT_HAS_ERRORED  = 'SCRIPT_HAS_ERRORED';
export const TWILIO_SCRIPT_LOAD_SUCCESS = 'SCRIPT_LOAD_SUCCESS';

export const TWILIO_CAPABILITY_TOKEN_HAS_ERRORED = 'TWILIO_CAPABILITY_TOKEN_HAS_ERRORED';
export const TWILIO_CAPABILITY_TOKEN_FETCH_SUCCESS = 'TWIIO_CAPABILITY_TOKEN_FETCH_SUCCESS';

export const TWILIO_DEVICE_READY = 'TWILIO_DEVICE_READY';
export const TWILIO_DEVICE_OFFLINE = 'TWILIO_DEVICE_OFFLINE';

// An incoming connection is canceled by the caller before being accepted by client
export const TWILIO_INCOMING_CALL_CANCELED = 'TWILIO_INCOMING_CALL_CANCELED'

/*
 Action creators
 */

// Script Actions
export function scriptHasErrored() {
  console.log('Error loading Twilio sdk');
  return {
    type: TWILIO_SCRIPT_HAS_ERRORED,
    payload: {}
  }
}

export function scriptLoadSuccess() {
  console.log('Twilio sdk loaded successfully!');
  return {
    type: TWILIO_SCRIPT_LOAD_SUCCESS,
    payload: {}
  }
}


// Capability Token Actions
export const fetchCapabilityToken = (url) => (dispatch, getState) => {
  axios.get(url)
    .then((response) => {
      if (response.status !== 200) {
        throw Error(response.statusText);
      }
      console.log(response);
      return response;
    })
    .then((response) => response.data )
    .then((capabilityToken) => dispatch(capabilityTokenFetchSuccess(capabilityToken)))
    .catch(() => dispatch(capabilityTokenHasErrored))
};


export function capabilityTokenHasErrored() {
  return {
    type: TWILIO_CAPABILITY_TOKEN_HAS_ERRORED,
    payload: {}
  };
}

export function capabilityTokenFetchSuccess(capabilityToken) {
  return {
    type: TWILIO_CAPABILITY_TOKEN_FETCH_SUCCESS,
    payload: {
      token: capabilityToken
    }
  }
}


// Device Actions
/*
 Initialize the twilio device
 This registers handlers for ready and offline.
 Registering handlers for incoming calls needs to be called separately
 */
export const initializeDevice = (
  capabilityToken,
  { closeProtection } = { closeProtection: true },
) => (dispatch, getState) => {
  window.Twilio.Device.setup(capabilityToken, {closeProtection: closeProtection});
  // Register handler to be called when the device is ready
  window.Twilio.Device.ready(() => {
    dispatch(twilioDeviceReady);
  });
  // Register handler to be called when the device is offline
  window.Twilio.Device.offline(() => {
    dispatch(twilioDeviceOffline);
  });
  // Register incoming call handler
  window.Twilio.Device.incoming((connection) => {
    dispatch(incomingCallEvent(connection));
  });
  window.Twilio.Device.disconnect((connection) => {
    dispatch(callCanceledEvent(connection));
  });
  // // Register call canceled handler
  window.Twilio.Device.cancel(() => {
    dispatch(incomingCallCanceled);
  });
};

export function twilioDeviceReady() {
  return {
    type: TWILIO_DEVICE_READY,
    payload: {}
  }
}

export function twilioDeviceOffline() {
  //todo add stuff to the frontend to handle these situations gracefully
  return {
    type: TWILIO_DEVICE_OFFLINE,
    payload: {}
  }
}


//Call Actions
export function incomingCallCanceled(conn) {
  return {
    type: TWILIO_INCOMING_CALL_CANCELED,
    paylod: {}
  }
}

