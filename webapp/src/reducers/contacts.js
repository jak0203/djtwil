import {
  CONTACTS_IS_LOADING,
  CONTACTS_FETCH_SUCCESS,
  CONTACTS_FETCH_ERROR
} from '../actions/contacts';

const initial_state = {
  isLoading: false,
  loaded: false,
  error: false,
  contacts: [],
};

export function contacts(state = initial_state, { type, payload }) {
  switch (type) {
    case CONTACTS_IS_LOADING:
      return {
        ...state,
        isLoading: payload.isLoading,
      };
    case CONTACTS_FETCH_SUCCESS:
      return {
        ...state,
        loaded: true,
        contacts: payload.contacts,
      };
    case CONTACTS_FETCH_ERROR:
      return {
        ...state,
        error: true,
      };
    default:
      return state;
  }
}
