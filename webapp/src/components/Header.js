import React, { Component } from 'react';
import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import { styles } from '../Style';

import { withStyles } from 'material-ui/styles';
import AppBar from 'material-ui/AppBar';
import IconButton from 'material-ui/IconButton';
import Toolbar from 'material-ui/Toolbar';
import Typography from 'material-ui/Typography';

import MenuIcon from 'material-ui-icons/Menu';

import { openDrawer } from '../actions/sidebar';

class Header extends Component {

  render () {
    let { title } = this.props;
    const { classes } = this.props;
    return (
      <div>
        <AppBar
          className={classNames(classes.appBar, this.props.sidebar.open && classes.appBarShift)}
        >
          <Toolbar disableGutters={!this.props.sidebar.open}>
            <IconButton
              color="inherit"
              aria-label="open drawer"
              onClick={this.props.openDrawer}
              className={classNames(classes.menuButton, this.props.sidebar.open && classes.hide)}
            >
              <MenuIcon/>
            </IconButton>
            <Typography variant="title" color="inherit" noWrap>
              { title }
            </Typography>
          </Toolbar>
        </AppBar>
      </div>
    )
  }
}

function mapStateToProps(state) {
  return {
    sidebar: state.sidebar
  };
}

function mapDispatchToProps(dispatch) {
  return {
    openDrawer: bindActionCreators(openDrawer, dispatch),
  }
}

Header.propTypes = {
  classes: PropTypes.object.isRequired,
  theme: PropTypes.object.isRequired,
};

export default withStyles(styles, { withTheme: true })(connect(
  mapStateToProps,
  mapDispatchToProps
)(Header));