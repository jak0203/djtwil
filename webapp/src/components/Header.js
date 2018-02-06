import React, { Component } from 'react';
import AppBar from 'material-ui/AppBar';
import Drawer from 'material-ui/Drawer';
import MenuItem from 'material-ui/MenuItem';
import FontIcon from 'material-ui/FontIcon';
import FlatButton from 'material-ui/FlatButton';
import Link from 'react-router-dom/Link';

class Header extends Component {
  constructor(props) {
    super(props);
    this.state = {
      open: false
    };
  }
  handleToggle = () => this.setState({open: !this.state.open});
  handleClose = () => this.setState({open: false});

  render() {
    let {menuList} = this.props;
    let {title} = this.props;
    let {user} = this.props;
    return (
      <div>
        <AppBar
          onLeftIconButtonClick={this.handleToggle}
          title={title}
          iconElementRight={<FlatButton label={user} />}
        />
        <Drawer
          open={this.state.open}
          docked={false}
          onRequestChange={(open) => this.setState({open})}
         >
          <AppBar onLeftIconButtonClick={this.handleToggle}/>
          {menuList.map(({title, icon, route}) => {
              return (
                <MenuItem
                  onClick={this.handleClose}
                  key={title}
                  leftIcon={<FontIcon className={icon}/>}
                  containerElement={<Link to={route} />}
                >
                  {title}
                </MenuItem>
              )
            }
          )}
        </Drawer>
      </div>

    )
  }
}

export default Header;