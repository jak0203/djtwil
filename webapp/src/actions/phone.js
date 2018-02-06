import Script from 'react-load-script';
import axios from 'axios';


/*
Action Types
 */

export const SCRIPT_IS_LOADING   = 'SCRIPT_IS_LOADING';
export const SCRIPT_HAS_ERRORED  = 'SCRIPT_HAS_ERRORED';
export const SCRIPT_LOAD_SUCCESS = 'SCRIPT_LOAD_SUCCESS';

export const CAPABILITY_TOKEN_IS_LOADING = 'CAPABILITY_TOKEN_IS_LOADING';
export const CAPABILITY_TOKEN_HAS_ERRORED = 'CAPABILITY_TOKEN_HAS_ERRORED';
export const CAPABILITY_TOKEN_FETCH_SUCCESS = 'FETCH_CAPABILITY_TOKEN_SUCCESS';

export const TOGGLE_MUTE = 'TOGGLE_MUTE';
/*
Action creators
 */
// scriptIsLoading
// scriptHasErrored
// scriptLoadSuccess

export function capabilityTokenIsLoading(bool) {
  return {
    type: CAPABILITY_TOKEN_IS_LOADING,
    isLoading: bool,
  };
}

export function capabilityTokenHasErrored(bool) {
  return {
    type: CAPABILITY_TOKEN_HAS_ERRORED,
    isLoading: bool,
  };
}

export function capabilityTokenFetchSuccess(capabilityToken) {
  return {
    type: CAPABILITY_TOKEN_FETCH_SUCCESS,
    capabilityToken,
  }
}

export function fetchCapabilityToken(url) {
  return (dispatch) => {
    dispatch(capabilityTokenIsLoading(true));
    axios.get(url)
      .then((response) => {
        if (response.status !== 200) {
          throw Error(response.statusText);
        }
        console.log(response);
        dispatch(capabilityTokenIsLoading(false));
        return response;
      })
      .then((response) => response.data)
      .then((capabilityToken) => dispatch(capabilityTokenFetchSuccess(capabilityToken)))
      // .then(() => dispatch(setupTwilioDevice()))
      .catch(() => dispatch(capabilityTokenHasErrored(true)))
  }
}

export function setupTwilioDevice() {
  return (dispatch) => {

  }
}

export function toggleMute() {
  //todo need to add the actual muting of twilio device but can't do that until the device is saved in state
  return {
    type: TOGGLE_MUTE,
    // muted: bool,
  }
}


