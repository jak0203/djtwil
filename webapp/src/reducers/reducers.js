// import { combineReducers } from 'redux'
import { TOGGLE_MUTE } from '../actions/actions'
import {
  CONTACTS_HAS_ERRORED,
  CONTACTS_IS_LOADING,
  CONTACTS_FETCH_DATA_SUCCESS
} from "../actions/actions";

const initial_state = {
  contacts: [],
};


export function contactsHasErrored(state = false, action) {
    switch (action.type) {
        case 'CONTACTS_HAS_ERRORED':
            return action.hasErrored;
        default:
            return state;
    }
}
export function contactsIsLoading(state = false, action) {
    switch (action.type) {
        case 'CONTACTS_IS_LOADING':
            return action.isLoading;
        default:
            return state;
    }
}
export function contacts(state = initial_state, action) {
    switch (action.type) {
      case 'CONTACTS_FETCH_DATA_SUCCESS':
            return {
              ...state,
              contacts: action.contacts
            };
        default:
            return state;
    }
}

// const rootReducer = combineReducers({
//   phoneCalls,
//   contacts
// });
//
// export default rootReducer;
