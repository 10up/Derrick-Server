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
 * Test suite for the composer command
 */
describe( 'wp', function() {

	it( 'Fail because no manifest.lock', function( done ) {

		var composer = proxyquire(
			'../../commands/wp',
			{
				winston: winstonStub,
				fs: {
					existsSync: function() {
						return false;
					}
				},
				child_process: {
					spawn: mySpawn
				}
			}
		);

		composer( {
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

		var composer = proxyquire(
			'../../commands/wp',
			{
				winston: winstonStub,
				fs: {
					existsSync: function() {
						return true;
					}
				},
				child_process: {
					spawn: mySpawn
				}
			}
		);

		mySpawn.setDefault( mySpawn.simple( 0, 'wp output' ) );

		composer( {
			params: {
				path: 'test'
			}
		}, socketStub ).then( function() {
			done();
		});
	} );

	it( 'Command outputs and exits unsuccessfully', function( done ) {

		var composer = proxyquire(
			'../../commands/wp',
			{
				winston: winstonStub,
				fs: {
					existsSync: function() {
						return true;
					}
				},
				child_process: {
					spawn: mySpawn
				}
			}
		);

		mySpawn.setDefault( mySpawn.simple( 0, 'wp output' ) );

		composer( {
			params: {
				path: 'test'
			}
		}, socketStub ).then( function() {
			// Command still fulfills when exit is unsuccessful
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

		var composer = proxyquire(
			'../../commands/wp',
			{
				winston: winstonStub,
				fs: {
					existsSync: function() {
						return true;
					}
				},
				child_process: {
					spawn: mySpawn
				}
			}
		);

		mySpawn.setDefault( mySpawn.simple( 0, 'test content to verify' ) );

		composer( {
			params: {
				path: 'test'
			}
		}, socketStub ).then( function() {
			assert( progress.length, 1 );
			assert( progress[0][1], 'test content to verify' );

			done();
		} );
	} );
} );