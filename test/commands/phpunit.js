/**
 * Test dependencies
 */
var proxyquire = require( 'proxyquire' ).noCallThru(),
	assert = require( 'assert' ),
	mockSpawn = require('mock-spawn'),
	mySpawn = mockSpawn();


winstonStub = {
	cli: function() {
		return {
			'error': function( message ) {

			},
			'info': function( message ) {

			}
		};
	}
};

var socketStub = {
	emit: function() {}
};

/**
 * Test suite for the phpunit command
 */
describe( 'phpunit', function() {

	it( 'Fail because no project', function( done ) {

		var phpunit = proxyquire(
			'../../commands/phpunit',
			{
				winston: winstonStub,
				child_process: {
					spawn: mySpawn
				}
			}
		);

		phpunit( {
			params: {
				path: 'test'
			}
		}, socketStub ).then( function() {
			// Command proceeded when it shouldn't have
		}, function() {
			done();
		});
	} );

	it( 'Fail because no manifest.lock', function( done ) {

		var phpunit = proxyquire(
			'../../commands/phpunit',
			{
				winston: winstonStub,
				fs: {
					readFileSync: function() {
						return false;
					}
				},
				child_process: {
					spawn: mySpawn
				}
			}
		);

		phpunit( {
			params: {
				path: 'test'
			}
		}, socketStub ).then( function() {
			// Command proceeded when it shouldn't have
		}, function() {
			done();
		});
	} );

	it( 'Command outputs and exits successfully', function( done ) {

		var phpunit = proxyquire(
			'../../commands/phpunit',
			{
				winston: winstonStub,
				fs: {
					readFileSync: function() {
						return JSON.stringify( {
							"resourceLocations": {
								"wp-config.php": "projects/wielers/config/wp-config.php",
								"wp-content/uploads": "projects/wielers/uploads"
							},
						} );
					}
				},
				child_process: {
					spawn: mySpawn
				}
			}
		);

		mySpawn.setDefault( mySpawn.simple( 0, 'phpunit output' ) );

		phpunit( {
			params: {
				path: 'test',
				rawArgs: 'argument'
			}
		}, socketStub ).then( function() {
			done();
		} );
	} );

	it( 'Command outputs and exits unsuccessfully', function( done ) {

		var phpunit = proxyquire(
			'../../commands/phpunit',
			{
				winston: winstonStub,
				fs: {
					readFileSync: function() {
						return JSON.stringify( {
							"resourceLocations": {
								"wp-config.php": "projects/wielers/config/wp-config.php",
								"wp-content/uploads": "projects/wielers/uploads"
							},
						} );
					}
				},
				child_process: {
					spawn: mySpawn
				}
			}
		);

		mySpawn.setDefault( mySpawn.simple( 1, 'phpunit output' ) );

		phpunit( {
			params: {
				path: 'test',
				rawArgs: 'argument'
			}
		}, socketStub ).then( function() {
			// Still fulfills even though there is an error
			done();
		} );
	} );

	it( 'Emits data properly to socket', function( done ) {

		var progress = [];
		var socketStub = {
			emit: function( channel, args ) {
				if ( channel && 'progress' === channel ) {
					progress.push( args.log );
				}
			}
		};

		var phpunit = proxyquire(
			'../../commands/phpunit',
			{
				winston: winstonStub,
				fs: {
					readFileSync: function() {
						return JSON.stringify( {
							"resourceLocations": {
								"wp-config.php": "projects/wielers/config/wp-config.php",
								"wp-content/uploads": "projects/wielers/uploads"
							},
						} );
					}
				},
				child_process: {
					spawn: mySpawn
				}
			}
		);

		mySpawn.setDefault( mySpawn.simple( 0, 'test content to verify' ) );

		phpunit( {
			params: {
				path: 'test',
				rawArgs: 'argument'
			}
		}, socketStub ).then( function() {
			assert( progress.length, 1 );
			assert( progress[0][1], 'test content to verify' );

			done();
		} );
	} );
} );