import React, { Component } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import { withStyles } from 'material-ui/styles';

import { styles } from '../Style';

import Typography from 'material-ui/Typography';


class Timer extends Component {
  state = {
    elapsed: 0,
  };
  componentDidMount = () => {
    this.timer = setInterval(this.tick, 50);
  };
  componentWillUnmount = () => {
    clearInterval(this.timer);
  };

  tick = () => {
    this.setState({elapsed: new Date() - this.props.start});
  };

  pad = (size, num) => {
    var s = String(num);
    while (s.length < (size || 2)) {s = "0" + s;}
    return s;
  };

  render () {
    let elapsed = Math.round(this.state.elapsed / 100);
    let d = (elapsed / 10).toFixed(1);
    let seconds = this.pad(2, Math.floor(d % 3600 % 60));
    let minutes = this.pad(2, Math.floor(d % 3600 / 60));
    let hours = this.pad(2, Math.floor(d / 3600));

    return (
      <div><Typography variant={'caption'}>{hours} : {minutes} : {seconds}</Typography></div>
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

  }
}

export default withStyles(styles)(connect(
  mapStateToProps,
  mapDispatchToProps
)(Timer));