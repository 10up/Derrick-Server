Derrick-Server
==============

[![Build Status](http://45.33.25.19:8080/buildStatus/icon?job=Derrick Server)](http://45.33.25.19:8080/job/Derrick Server/)

Derrick Server is the global CLI application used within the Derrick VM instance for controlling Docker containers and site instantiation.

### Installation

This module is not installed separately; Derrick will automatically install the module using NPM during initial provisioning.

### Release History

 * 2015-06-19   v0.1.4   Truncate long database names to <= 16 chars to prevent a MySQL error
 * 2015-06-11   v0.1.3   Force the hosts.json and portmap.json to import from /srv/system
 * 2015-06-09   v0.1.2   Introduce Mocha unit testing for passthru commands
 * 2015-05-15   v0.1.1   Version bump for NPM update purposes
 * 2015-05-15   v0.1.0   Initial release

## Copyright / License

Derrick CLI is copyright (c) 2015 by [10up](http://10up.com) and its various contributors under the terms of the MIT license.