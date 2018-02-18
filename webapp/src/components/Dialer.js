import React, { Component } from 'react';
import Script from 'react-load-script'
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import { withStyles } from 'material-ui/styles';

import { styles } from '../Style';

import Button from 'material-ui/Button';
import Drawer from 'material-ui/Drawer';
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
} from '../actions/phone';
import {
  scriptHasErrored,
  scriptLoadSuccess,
  fetchCapabilityToken,
  initializeDevice,
} from '../actions/twilio';

import IncomingCallAlert from './Dialer/IncomingCallAlert';



class Dialer extends Component {
  componentWillUpdate = (nextProps, nextState) => {
    if (this.props.twilio.scriptLoaded === false && nextProps.twilio.scriptLoaded ===true) {
      this.props.fetchCapabilityToken('/phonecalls/capabilityToken?client=reactweb');
    }
  };

  componentDidUpdate = (prevProps, prevState) => {
    if (prevProps.twilio.capabilityTokenReceived === false && this.props.twilio.capabilityTokenReceived === true) {
      console.log('setting up twilio device');
      this.props.initializeDevice(this.props.twilio.capabilityToken.token);
    }
  };

  render() {
    const { classes } = this.props;

    if (!this.props.twilio.scriptLoaded) {
      return (
        <Script
          url='https://media.twiliocdn.com/sdk/js/client/v1.4/twilio.min.js'
          onError={this.props.scriptHasErrored}
          onLoad={this.props.scriptLoadSuccess}
        />
      )
    }
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
        {/*//todo this button should only show if onPhone = false*/}
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
        {this.props.phone.incomingCallRinging ?
          <IncomingCallAlert/> : null
        }




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
    scriptLoadSuccess: bindActionCreators(scriptLoadSuccess, dispatch),
    scriptHasErrored: bindActionCreators(scriptHasErrored, dispatch),
    fetchCapabilityToken: bindActionCreators(fetchCapabilityToken, dispatch),
    initializeDevice: bindActionCreators(initializeDevice, dispatch),
    changeNumber: bindActionCreators(changeNumber, dispatch),
    placeOutboundCall: bindActionCreators(placeOutboundCall, dispatch),
    endCall: bindActionCreators(endCall, dispatch),
  }
}

Dialer.propTypes = {
  classes: PropTypes.object.isRequired,
};

export default withStyles(styles)(connect(
  mapStateToProps,
  mapDispatchToProps
)(Dialer));