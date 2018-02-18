import axios from 'axios';

export const CONTACTS_IS_LOADING = 'CONTACTS_IS_LOADING';
export const CONTACTS_FETCH_SUCCESS = 'CONTACTS_FETCH_SUCCESS';
export const CONTACTS_FETCH_ERROR = 'CONTACTS_FETCH_ERROR';

export function contactsIsLoading(bool) {
  return {
    type: CONTACTS_IS_LOADING,
    payload: {
      isLoading: bool,
    },
  };
}

export function contactsFetchSuccess(contacts) {
  return {
    type: CONTACTS_FETCH_SUCCESS,
    payload: {
      contacts: contacts,
    },
  };
}

export function contactsHasErrored() {
  return {
    type: CONTACTS_FETCH_ERROR,
    payload: {},
  };
}


export function contactsFetchData(url) {
  return (dispatch) => {
    dispatch(contactsIsLoading(true));
    axios.get(url)
      .then((response) => {
        if (response.status !== 200) {
          throw Error(response.statusText);
        }
        dispatch(contactsIsLoading(false));
        return response;
      })
      .then((response) => response.data)
      .then((contacts) => dispatch(contactsFetchSuccess(contacts)))
      .catch(() => dispatch(contactsHasErrored(true)));
  };
}
