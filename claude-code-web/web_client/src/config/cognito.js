/**
 * AWS Cognito Configuration
 *
 * Configuration is loaded from environment variables:
 * - VITE_COGNITO_REGION: AWS region (default: us-west-2)
 * - VITE_COGNITO_USER_POOL_ID: Cognito User Pool ID
 * - VITE_COGNITO_CLIENT_ID: Cognito User Pool Client ID
 * - VITE_COGNITO_OAUTH_DOMAIN: OAuth domain for hosted UI (optional)
 */

export const cognitoConfig = {
  region: import.meta.env.VITE_COGNITO_REGION || 'us-west-2',
  userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || 'us-west-2_Sw8yyFfBT',
  userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '2d2cqqjvpf1ecqjg6gh1u6fivl',

  // OAuth configuration (optional)
  oauth: {
    domain: import.meta.env.VITE_COGNITO_OAUTH_DOMAIN || '', // Add if using Cognito hosted UI
    scope: ['email', 'openid', 'profile'],
    redirectSignIn: window.location.origin,
    redirectSignOut: window.location.origin,
    responseType: 'code'
  }
}

// Amplify Auth configuration
export const authConfig = {
  Auth: {
    Cognito: {
      userPoolId: cognitoConfig.userPoolId,
      userPoolClientId: cognitoConfig.userPoolClientId,
      region: cognitoConfig.region,
      loginWith: {
        email: true,
        username: true  // Enable username login
      }
    }
  }
}
