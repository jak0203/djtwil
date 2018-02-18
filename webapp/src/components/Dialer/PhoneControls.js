import React, { Component } from 'react';
import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import classNames from 'classnames';
import PropTypes from 'prop-types';

import { styles } from '../../Style';

import { withStyles } from 'material-ui/styles';

import AppBar from 'material-ui/AppBar';
import Button from 'material-ui/Button';
import Grid from 'material-ui/Grid';
import Tooltip from 'material-ui/Tooltip';
import Typography from 'material-ui/Typography';

import MicOffIcon from 'material-ui-icons/MicOff';
import MicIcon from 'material-ui-icons/Mic';
import PhoneIcon from 'material-ui-icons/Phone';

import Timer from '../Timer';

import {
  changeNumber,
  placeOutboundCall,
  endCall,
  toggleMute
} from '../../actions/phone';
import {
  scriptHasErrored,
  scriptLoadSuccess,
  fetchCapabilityToken,
  initializeDevice,
} from '../../actions/twilio';

class PhoneControls extends Component {
  render() {
    const {classes} = this.props;
    return (
      <div>
        <AppBar
          color={'default'}
        >
          <Grid container className={classes.phoneControls}>
            <Grid item sm={1}/>
            <Grid item sm={1}>
              <Grid container>
                <Grid item sm={12}>
                  <Typography variant={'subheading'}>+15129648470 {this.props.phone.currentCall}</Typography>
                </Grid>
                <Grid item sm={12}>
                  <Timer start={Date.now()}/>
                </Grid>
              </Grid>
            </Grid>
            <Grid item sm={2}>
              <Tooltip title={'End Call'}>
                <Button
                  variant={'fab'}
                  color={"secondary"}
                  onClick={this.props.endCall}
                  className={classes.button}
                >
                  <PhoneIcon transform={"rotate(135)"}/>
                </Button>
              </Tooltip>

              {this.props.phone.muted ?
                <Tooltip title={'Un-mute Call'}>
                  <Button
                    variant={'fab'}
                    color={"primary"}
                    onClick={this.props.toggleMute}
                    className={classes.button}
                  >
                    <MicIcon/>
                  </Button>
                </Tooltip>
                :
                <Tooltip title={'Mute Call'}>
                  <Button
                    variant={'fab'}
                    color={"primary"}
                    onClick={this.props.toggleMute}
                    className={classes.button}
                  >
                    <MicOffIcon/>
                  </Button>
                </Tooltip>
              }
            </Grid>
          </Grid>
        </AppBar>
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
    toggleMute: bindActionCreators(toggleMute, dispatch),
  }
}

PhoneControls.propTypes = {
  classes: PropTypes.object.isRequired,
};

export default withStyles(styles)(connect(
  mapStateToProps,
  mapDispatchToProps
)(PhoneControls));