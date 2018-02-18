import React, { Component } from 'react';

import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import { withStyles } from 'material-ui/styles';

import { styles } from '../../Style';

import Button from 'material-ui/Button';
import Input, { InputLabel, InputAdornment } from 'material-ui/Input';
import { FormControl, FormHelperText } from 'material-ui/Form';
import Paper from 'material-ui/Paper';
import Tooltip from 'material-ui/Tooltip';
import Typography from 'material-ui/Typography';

import PhoneIcon from 'material-ui-icons/Phone';

// import * as phone_actions from '../actions/phone';
import {
  changeNumber,
  placeOutboundCall,
  endCall
} from '../../actions/phone';


class NumberInput extends Component {
  render () {
    const {classes} = this.props;
    return (
      <div>
        <FormControl className={classes.formControl}>
          <InputLabel htmlFor="number">Number</InputLabel>
          <Input
            id="current-number"
            value={this.props.phone.currentNumber}
            onChange={this.props.changeNumber}
            startAdornment={<InputAdornment position="start">+1</InputAdornment>}
          />
        </FormControl>
        {this.props.phone.onPhone ?
          <Tooltip title={'End Call'}>
          <Button
            variant={'fab'}
            color={"secondary"}
            onClick={this.props.endCall}
          >
            <PhoneIcon transform={"rotate(135)"}/>
          </Button>
          </Tooltip>
        :
        <Tooltip title={'Place Call'}>
          <Button
          variant={'fab'}
          color={"primary"}
          onClick={this.props.placeOutboundCall}
          disabled={this.props.phone.onPhone}
        >

          <PhoneIcon/>
        </Button>
        </Tooltip>
        }

        <Paper className={classes.genericPaper}>
          <Typography variant={'caption'}>
            {this.props.phone.log}
          </Typography>
        </Paper>
      </div>
    )
  }
}

function mapStateToProps(state) {
  return {
    phone: state.phone,
    twilio: state.twilio,
  };
}

function mapDispatchToProps(dispatch) {
  return {
    changeNumber: bindActionCreators(changeNumber, dispatch),
    placeOutboundCall: bindActionCreators(placeOutboundCall, dispatch),
    endCall: bindActionCreators(endCall, dispatch),
  }
}

NumberInput.propTypes = {
  classes: PropTypes.object.isRequired,
};

export default withStyles(styles)(connect(
  mapStateToProps,
  mapDispatchToProps
)(NumberInput));