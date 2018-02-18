import React, { Component } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import { Link } from 'react-router-dom'
import classNames from 'classnames';
import PropTypes from 'prop-types';

import { styles } from '../Style';
import { withStyles } from 'material-ui/styles';
import Divider from 'material-ui/Divider'
import Drawer from 'material-ui/Drawer';
import IconButton from 'material-ui/IconButton';
import List from 'material-ui/List';
import { ListItem, ListItemIcon, ListItemText } from 'material-ui/List';

import ChevronLeftIcon from 'material-ui-icons/ChevronLeft';
import ChevronRightIcon from 'material-ui-icons/ChevronRight';

import { openDrawer, closeDrawer } from '../actions/sidebar';

class Sidebar extends Component {
  render () {
    let { menuList } = this.props;
    const { classes, theme } = this.props;
    return (
      <div>
        <Drawer
          variant="permanent"
          classes={{
            paper: classNames(classes.drawerPaper, !this.props.sidebar.open && classes.drawerPaperClose),
          }}
          open={this.props.sidebar.open}
        >
          <div className={classes.drawerInner}>
            <div className={classes.drawerHeader}>
              <IconButton
                onClick={this.props.closeDrawer}
              >
                {theme.direction === 'rtl' ? <ChevronRightIcon /> : <ChevronLeftIcon />}
              </IconButton>
            </div>
            <Divider/>
            <List className={classes.list}>
              {menuList.map( ({icon, title, route}) => {
                return (
                  <ListItem button key={title} component={Link} to={route}>
                    <ListItemIcon>
                      {icon}
                    </ListItemIcon>
                    <ListItemText primary={title}/>
                  </ListItem>
                )
              })}
            </List>
          </div>
        </Drawer>
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
    closeDrawer: bindActionCreators(closeDrawer, dispatch),
  }
}

Sidebar.propTypes = {
  classes: PropTypes.object.isRequired,
  theme: PropTypes.object.isRequired,
};

export default withStyles(styles, { withTheme: true })(connect(
  mapStateToProps,
  mapDispatchToProps
)(Sidebar));