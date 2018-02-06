import {
  TOGGLE_MUTE,
  CAPABILITY_TOKEN_FETCH_SUCCESS
} from '../actions/phone'

const initial_state = {
  scriptLoaded: false,
  scriptError: false,
  capabilityToken: {},
  muted: false,

};

export function phone(state = initial_state, action) {
  switch (action.type) {
    case CAPABILITY_TOKEN_FETCH_SUCCESS:
      return {
        ...state,
        capabilityToken: action.capabilityToken,
      };
    case TOGGLE_MUTE:
      return  {
        ...state,
        muted: !state.muted
      };
    default:
      return state;
  }
}

// export function phoneCalls(state=initial_state, action) {
//   switch (action.type) {
//     case TOGGLE_MUTE:
//       return  {
//         ...state,
//         muted: !state.muted
//       };
//     default:
//       return state;
//   }
//
// }