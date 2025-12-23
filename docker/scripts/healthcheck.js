#!/usr/bin/env node
/**
 * Health check script for Baileys Docker containers
 * Checks various aspects of the application health
 */

const fs = require('fs');
const http = require('http');

// Configuration
const HEALTH_CHECKS = {
    authState: {
        enabled: true,
        path: '/app/baileys_auth_info',
    },
    apiServer: {
        enabled: process.env.CHECK_API_SERVER === 'true',
        host: 'localhost',
        port: parseInt(process.env.PORT || '3001'),
        path: '/api/status',
    },
};

// Exit codes
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

/**
 * Check if authentication directory exists and is accessible
 */
function checkAuthState() {
    return new Promise((resolve) => {
        const authPath = HEALTH_CHECKS.authState.path;

        try {
            if (!fs.existsSync(authPath)) {
                console.error(`Health check failed: Auth directory not found at ${authPath}`);
                resolve(false);
                return;
            }

            const stats = fs.statSync(authPath);
            if (!stats.isDirectory()) {
                console.error(`Health check failed: ${authPath} is not a directory`);
                resolve(false);
                return;
            }

            // Check if directory is readable
            fs.accessSync(authPath, fs.constants.R_OK | fs.constants.W_OK);
            console.log('✓ Auth directory is accessible');
            resolve(true);
        } catch (error) {
            console.error(`Health check failed: Auth directory error - ${error.message}`);
            resolve(false);
        }
    });
}

/**
 * Check if API server is responding
 */
function checkApiServer() {
    return new Promise((resolve) => {
        const options = {
            host: HEALTH_CHECKS.apiServer.host,
            port: HEALTH_CHECKS.apiServer.port,
            path: HEALTH_CHECKS.apiServer.path,
            method: 'GET',
            timeout: 5000,
        };

        const req = http.request(options, (res) => {
            if (res.statusCode === 200) {
                console.log('✓ API server is responding');
                resolve(true);
            } else {
                console.error(`Health check failed: API server returned status ${res.statusCode}`);
                resolve(false);
            }
        });

        req.on('error', (error) => {
            console.error(`Health check failed: API server error - ${error.message}`);
            resolve(false);
        });

        req.on('timeout', () => {
            console.error('Health check failed: API server timeout');
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

/**
 * Run all enabled health checks
 */
async function runHealthChecks() {
    console.log('Running health checks...');

    const results = [];

    // Check auth state
    if (HEALTH_CHECKS.authState.enabled) {
        const authResult = await checkAuthState();
        results.push(authResult);
    }

    // Check API server
    if (HEALTH_CHECKS.apiServer.enabled) {
        const apiResult = await checkApiServer();
        results.push(apiResult);
    }

    // Determine overall health
    const allPassed = results.every((result) => result === true);

    if (allPassed) {
        console.log('✓ All health checks passed');
        process.exit(EXIT_SUCCESS);
    } else {
        console.error('✗ Some health checks failed');
        process.exit(EXIT_FAILURE);
    }
}

// Run health checks
runHealthChecks().catch((error) => {
    console.error(`Unexpected error during health check: ${error.message}`);
    process.exit(EXIT_FAILURE);
});
