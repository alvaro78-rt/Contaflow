import { getAccessToken } from '@base44/sdk';
import { resolveBase44AppId, resolveBase44FunctionsVersion } from './base44BackendUrl';

const isNode = typeof window === 'undefined';

const isClearAccessTokenRequested = () =>
	!isNode && new URLSearchParams(window.location.search).get("clear_access_token") === 'true';

const clearStoredAccessToken = () => {
	window.localStorage.removeItem('base44_access_token');
	window.localStorage.removeItem('token');
}

const getAppParams = () => {
	if (isClearAccessTokenRequested()) {
		clearStoredAccessToken();
	}
	const pageOrigin = isNode ? '' : window.location.origin;
	return {
		appId: resolveBase44AppId({ pageOrigin, configuredAppId: import.meta.env.VITE_BASE44_APP_ID }),
		token: getAccessToken(),
		functionsVersion: resolveBase44FunctionsVersion({
			pageOrigin,
			search: isNode ? '' : window.location.search,
			configuredVersion: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION,
		}),
		appBaseUrl: import.meta.env.VITE_BASE44_APP_BASE_URL,
	}
}


export const appParams = {
	...getAppParams()
}
