from django.conf import settings
from django.http import HttpResponse, HttpResponseForbidden
from django.shortcuts import render
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from functools import wraps
from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VoiceGrant
from twilio.twiml.voice_response import VoiceResponse
from twilio.request_validator import RequestValidator

# import the logging library
import logging

# Get an instance of a logger
logger = logging.getLogger(__name__)


IDENTITY = 'voice_test'


def validate_twilio_request(f):
    """Validates that incoming requests genuinely originated from Twilio"""
    @wraps(f)
    def decorated_function(request, *args, **kwargs):
        # Create an instance of the RequestValidator class
        validator = RequestValidator(settings.TWILIO_AUTH_TOKEN)

        # Validate the request using its URL, POST data,
        # and X-TWILIO-SIGNATURE header
        request_valid = validator.validate(
            request.build_absolute_uri(),
            request.POST,
            request.META.get('HTTP_X_TWILIO_SIGNATURE', ''))

        # Continue processing the request if it's valid, return a 403 error if
        # it's not
        if request_valid:
            return f(request, *args, **kwargs)
        else:
            return HttpResponseForbidden()
    return decorated_function


@require_http_methods(["GET", "POST"])
def token(request):
    account_sid = settings.TWILIO_ACCOUNT_SID
    api_key = settings.TWILIO_API_KEY
    api_key_secret = settings.TWILIO_API_KEY_SECRET
    push_credential_sid = settings.TWILIO_PUSH_CREDENTIAL_SID
    app_sid = settings.TWILIO_APP_SID
    grant = VoiceGrant(
        push_credential_sid=push_credential_sid,
        outgoing_application_sid=app_sid
    )
    token = AccessToken(account_sid, api_key, api_key_secret, identity=IDENTITY)
    token.add_grant(grant)
    return HttpResponse(token.to_jwt())


@require_http_methods(["GET", "POST"])
@csrf_exempt
@validate_twilio_request
def incoming(request):
    # Create a new TwiML response
    resp = VoiceResponse()

    # <Say> a message to the caller
    from_number = request.POST['From']
    body = """
    Thanks for calling!

    Your phone number is {0}. I got your call because of Twilio's webhook.

    Goodbye! YAHOO!""".format(' '.join(from_number))
    resp.say(body)

    # Return the TwiML
    return HttpResponse(resp)


@require_http_methods(["GET", "POST"])
@csrf_exempt
@validate_twilio_request
def outgoing(request):
    resp = VoiceResponse()
    resp.say("Congratulations! You have made your first outbound call! Good bye.")
    # resp.dial(callerId='+15123990458')
    return HttpResponse(str(resp))


