import {combineReducers} from "redux";
import { contacts } from "./reducers";
import { phone } from './phone';


export default combineReducers({
  phone,
  contacts
});

// export default rootReducer;