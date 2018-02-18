import React, { Component } from 'react';
import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import classNames from 'classnames';
import PropTypes from 'prop-types';

import { styles } from '../../Style';

import { withStyles } from 'material-ui/styles';

import Button from 'material-ui/Button';
import Paper from 'material-ui/Paper';
import Tooltip from 'material-ui/Tooltip';
import Typography from 'material-ui/Typography';

import PhoneIcon from 'material-ui-icons/Phone';

import {
  incomingCallAccept,
  incomingCallIgnore,
  incomingCallReject,
} from '../../actions/phone';



class IncomingCallAlert extends Component {
  render() {
    const {classes} = this.props;
    return (
      <div>
        <Paper className={classes.genericPaper}>
          <Typography variant={'headline'}>Incoming Call from {this.props.phone.incomingCaller}</Typography>

          <Tooltip title={'Answer'}>
            <Button
              variant={'fab'}
              color={"primary"}
              onClick={this.props.incomingCallAccept}
              className={classes.button}
            >
              <PhoneIcon/>
            </Button>
          </Tooltip>
          <Tooltip title={'Ignore'}>
            <Button
              variant={'fab'}
              color={"secondary"}
              onClick={this.props.incomingCallIgnore}
              className={classes.button}
            >
              <PhoneIcon transform={"rotate(135)"}/>
            </Button>
          </Tooltip>
          <Tooltip title={'Reject'}>
            <Button
              variant={'fab'}
              color={"secondary"}
              onClick={this.props.incomingCallReject}
              className={classes.button}
            >
              <PhoneIcon transform={"rotate(135)"}/>
            </Button>
          </Tooltip>
        </Paper>
      </div>
    )
  }
}

function mapStateToProps(state) {
  return {
    phone: state.phone,
  }
}

function mapDispatchToProps(dispatch) {
  return {
    incomingCallAccept: bindActionCreators(incomingCallAccept, dispatch),
    incomingCallIgnore: bindActionCreators(incomingCallIgnore, dispatch),
    incomingCallReject: bindActionCreators(incomingCallReject, dispatch),
  }
}

IncomingCallAlert.propTypes = {
  classes: PropTypes.object.isRequired,
};

export default withStyles(styles)(connect(
  mapStateToProps,
  mapDispatchToProps
)(IncomingCallAlert));