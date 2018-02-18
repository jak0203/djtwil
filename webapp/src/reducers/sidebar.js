import {
  OPEN_DRAWER,
  CLOSE_DRAWER,
} from '../actions/sidebar';

const initial_state = {
  open: false,
};

export function sidebar(state = initial_state, { type, payload }) {
  switch (type) {
    case OPEN_DRAWER:
      return {
        ...state,
        open: true,
      };
    case CLOSE_DRAWER:
      return {
        ...state,
        open: false,
      };
    default:
      return state;
  }
}

