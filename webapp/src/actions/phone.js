/*
 Action Types
 */

export const PLACE_OUTBOUND_CALL = 'PLACE_OUTBOUND_CALL';
export const END_CALL = 'END_CALL';

export const TOGGLE_MUTE = 'TOGGLE_MUTE';

export const CHANGE_NUMBER = 'CHANGE_NUMBER';

export const INCOMING_CALL_EVENT = 'INCOMING_CALL_EVENT';
export const INCOMING_CALL_ACCEPT = 'INCOMING_CALL_ACCEPT';
export const INCOMING_CALL_IGNORE = 'INCOMING_CALL_IGNORE';
export const INCOMING_CALL_REJECT = 'INCOMING_CALL_REJECT';

export const CALL_CANCELED_EVENT = 'CALL_CANCELED_EVENT';


/*
Action creators
 */
export function validateNumber(number) {
  const v = /^([0-9]|#|\*)+$/.test(number.replace(/[-()\s]/g,''));
  console.log(v);
  return {
      isValid: v
    }
}

export function changeNumber(event) {
  const number = event.target.value;
  return {
    type: CHANGE_NUMBER,
    payload: {
      number: number,
      isValid: validateNumber(number).isValid,
    }
  }
}

export const placeOutboundCall = () => (dispatch, getState) => {
  const { number } = getState().phone;
  //TODO add handling for if I'm trying to make an outbound call but am already on phone?
  //TODO add handling for calling a contact on another app
  dispatch ({
    type: PLACE_OUTBOUND_CALL,
    payload: {
      currentCall: number
    },
  });
  window.Twilio.Device.connect({To: number});
};

export const endCall = () => (dispatch, getState) => {
  window.Twilio.Device.disconnectAll();
  dispatch({
    type: END_CALL,
    payload: {},
  });
};

export const incomingCallEvent = (conn) => (dispatch, getState) => {
  let { phone } = getState();
  if (!phone.onPhone) {
    dispatch({
      type: INCOMING_CALL_EVENT,
      payload: {
        incomingCaller: conn.parameters.From,
        connection: conn
      }
    })
  } else {
    dispatch ({
      type: INCOMING_CALL_REJECT,
      payload: {
        incomingCaller: conn.parameters.From,
      }
    })
  }
};

export const incomingCallAccept = () => (dispatch, getState) => {
  const { connection } = getState().phone;
  connection.accept();
  dispatch({
    type: INCOMING_CALL_ACCEPT,
    payload: {
      currentCall: connection.parameters.From,
    }
  })
};

export const incomingCallIgnore = () => (dispatch, getState) => {
  const { connection } = getState().phone;
  connection.ignore();
  dispatch({
    type: INCOMING_CALL_IGNORE,
    payload: {}
  })
};

export const incomingCallReject = () => (dispatch, getState) => {
  const { connection } = getState().phone;
  connection.reject();
  dispatch ({
    type: INCOMING_CALL_REJECT,
    payload: {}
  })
};

export function callCanceledEvent(conn) {
  return {
    type: CALL_CANCELED_EVENT,
    payload: {
      caller: conn.parameters.From,
    }
  }
}

/*
Toggle the muted state of the current phonecall
 */
export const toggleMute = () => (dispatch, getState) => {
  let muted = !getState().phone.muted;
  window.Twilio.Device.activeConnection().mute(muted);
  dispatch({
    type: TOGGLE_MUTE,
    payload: {
      muted: muted,
    }
  })
};
