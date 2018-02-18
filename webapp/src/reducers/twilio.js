import {
  TWILIO_CAPABILITY_TOKEN_FETCH_SUCCESS,
  TWILIO_CAPABILITY_TOKEN_HAS_ERRORED,
  TWILIO_DEVICE_OFFLINE,
  TWILIO_DEVICE_READY,
  TWILIO_SCRIPT_HAS_ERRORED,
  TWILIO_SCRIPT_LOAD_SUCCESS,
  TWILIO_INCOMING_CALL_CANCELED
} from '../actions/twilio';

const initial_state = {
  scriptLoaded: false,
  scriptError: false,
  capabilityToken: {},
  capabilityTokenReceived: false,
  deviceReady: false,
  incomingCallRinging: false,
  incomingCallFrom: '',
};

export function twilio(state = initial_state, { type, payload }) {
  switch (type) {
    case TWILIO_SCRIPT_HAS_ERRORED:
      return {
        ...state,
        scriptError: true,
      };
    case TWILIO_SCRIPT_LOAD_SUCCESS:
      return {
        ...state,
        scriptLoaded: true,
        scriptError: false,
      };
    case TWILIO_CAPABILITY_TOKEN_HAS_ERRORED:
      return {
        ...state,
        capabilityTokenReceived: false,
      };
    case TWILIO_CAPABILITY_TOKEN_FETCH_SUCCESS:
      return {
        ...state,
        capabilityTokenReceived: true,
        capabilityToken: payload.token,
      };
    case TWILIO_DEVICE_READY:
      return {
        ...state,
        deviceReady: true
      };
    case TWILIO_DEVICE_OFFLINE:
      return {
        ...state,
        deviceReady: false
      };
    case TWILIO_INCOMING_CALL_CANCELED:
      return {
        ...state,
        incomingCallRinging: false,
        onPhone: false,
        muted: false,
      };
    default:
      return state;
  }
}