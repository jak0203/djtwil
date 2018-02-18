import {combineReducers} from 'redux'
import {contacts} from './contacts';
import {phone} from './phone';
import {twilio} from './twilio';
import {sidebar} from './sidebar';

export default combineReducers({
  phone,
  contacts,
  twilio,
  sidebar,
});
