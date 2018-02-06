import axios from 'axios';

/*
* Action Types
*/
export const CONTACTS_HAS_ERRORED = 'CONTACTS_HAS_ERRORED';
export const CONTACTS_IS_LOADING = 'CONTACTS_IS_LOADING';
export const CONTACTS_FETCH_DATA_SUCCESS = 'CONTACTS_FETCH_DATA_SUCCESS';

/*
 * other constants
 */



/*
 * Action creators
 */


/*
 * contacts action creators
 */

export function contactsHasErrored(bool) {
  return {
    type: 'CONTACTS_HAS_ERRORED',
    hasErrored: bool
  };
}
export function contactsIsLoading(bool) {
  return {
    type: 'CONTACTS_IS_LOADING',
    isLoading: bool
  };
}
export function contactsFetchDataSuccess(contacts) {
  return {
    type: 'CONTACTS_FETCH_DATA_SUCCESS',
    contacts
  };
}

// export function errorAfterFiveSeconds() {
//   // We return a function instead of an action object
//   return (dispatch) => {
//     setTimeout(() => {
//       // This function is able to dispatch other action creators
//       dispatch(contactsHasErrored(true));
//     }, 5000);
//   };
// }

export function contactsFetchData(url) {
  return (dispatch) => {
    dispatch(contactsIsLoading(true));
    // fetch(url)
    axios.get(url)
      .then((response) => {
        if (response.status !== 200) {
          throw Error(response.statusText);
        }
        dispatch(contactsIsLoading(false));
        return response;
      })
      .then((response) => response.data)
      .then((contacts) => dispatch(contactsFetchDataSuccess(contacts)))
      .catch(() => dispatch(contactsHasErrored(true)));
  };
}

