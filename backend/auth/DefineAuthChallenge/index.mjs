// Lambda: DefineAuthChallenge
const MAX_ATTEMPTS = 3;

export const handler = async (event) => {
    const session = event.request.session || [];
    const last = session[session.length - 1];

    console.log(`Define: user=${event.userName} userNotFound=${event.request.userNotFound} ` +
        `session=${JSON.stringify(session.map(s => ({ c: s.challengeName, r: s.challengeResult })))}`);

    if (event.request.userNotFound) {
        event.response.issueTokens = false;
        event.response.failAuthentication = true;
    } else if (session.length === 0) {
        event.response.issueTokens = false;
        event.response.failAuthentication = false;
        event.response.challengeName = "CUSTOM_CHALLENGE";
    } else if (last.challengeName === "CUSTOM_CHALLENGE" && last.challengeResult === true) {
        event.response.issueTokens = true;
        event.response.failAuthentication = false;
    } else if (session.length >= MAX_ATTEMPTS) {
        event.response.issueTokens = false;
        event.response.failAuthentication = true;
    } else {
        event.response.issueTokens = false;
        event.response.failAuthentication = false;
        event.response.challengeName = "CUSTOM_CHALLENGE";
    }

    return event;
};