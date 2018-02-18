import {
  TOGGLE_MUTE,
  CHANGE_NUMBER,
  PLACE_OUTBOUND_CALL,
  END_CALL,
  INCOMING_CALL_EVENT,
  INCOMING_CALL_ACCEPT,
  INCOMING_CALL_IGNORE,
  INCOMING_CALL_REJECT, CALL_CANCELED_EVENT,
} from '../actions/phone'

const initial_state = {
  muted: false,
  log: null,
  onPhone: false,
  validNumber: false,
  number: '',
  incomingCaller: '',
  incomingCallRinging: false,
  currentCall: '',
};

export function phone(state = initial_state, {type, payload}) {
  switch (type) {
    case TOGGLE_MUTE:
      return  {
        ...state,
        muted: payload.muted
      };
    case CHANGE_NUMBER:
      return {
        ...state,
        number: payload.number,
        validNumber: payload.isValid,
      };
    case PLACE_OUTBOUND_CALL:
      return {
        ...state,
        onPhone: true,
        muted: false,
        currentCall: payload.currentCall,
      };
    case END_CALL:
      return {
        ...state,
        onPhone: false,
        muted: false,
        log: 'Call ended',
        currentCall: '',
      };
    case INCOMING_CALL_EVENT:
      return {
        ...state,
        incomingCallRinging: true,
        incomingCaller: payload.incomingCaller,
        log: 'Incoming call from ' + payload.incomingCaller,
        connection: payload.connection,
      };
    case INCOMING_CALL_ACCEPT:
      return {
        ...state,
        onPhone: true,
        incomingCallRinging: false,
        muted: false,
        log: 'Incoming call accepted',
        currentCall: payload.currentCall,
      };
    case INCOMING_CALL_IGNORE:
      return {
        ...state,
        incomingCallRinging: false,
        log: 'Incoming call ignored',
      };
    case INCOMING_CALL_REJECT:
      return {
        ...state,
        incomingCallRinging: false,
        log: 'Incoming call rejected',
      };
    case CALL_CANCELED_EVENT:
      return {
        ...state,
        onPhone: false,
        log: 'Call ended'
      };
    default:
      return state;
  }
}
