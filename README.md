Derrick-Server

> Derrick Server is the global CLI application used within the Derrick VM instance for controlling Docker containers and site instantiation.

[![Support Level](https://img.shields.io/badge/support-archived-red.svg)](#support-level) [![Release Version](https://img.shields.io/github/tag/10up/Derrick-Server.svg)](https://github.com/10up/Derrick-Server/releases/latest) [![MIT License](https://img.shields.io/github/license/10up/Derrick-Server.svg)](https://github.com/10up/Derrick-Server/blob/master/LICENSE.md)

## Installation

This module is not installed separately; Derrick will automatically install the module using NPM during initial provisioning.

## Support Level

**Archived:** This project is no longer maintained by 10up.  We are no longer responding to Issues or Pull Requests unless they relate to security concerns.  We encourage interested developers to fork this project and make it their own!

## Release History

 * 2015-06-19   v0.1.4   Truncate long database names to <= 16 chars to prevent a MySQL error
 * 2015-06-11   v0.1.3   Force the hosts.json and portmap.json to import from /srv/system
 * 2015-06-09   v0.1.2   Introduce Mocha unit testing for passthru commands
 * 2015-05-15   v0.1.1   Version bump for NPM update purposes
 * 2015-05-15   v0.1.0   Initial release

## Copyright / License

Derrick CLI is copyright (c) 2015 by [10up](http://10up.com) and its various contributors under the terms of the MIT license.
