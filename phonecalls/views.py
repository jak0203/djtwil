import re

from django.conf import settings
from django.http import HttpResponse, HttpResponseForbidden, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from functools import wraps
from rest_framework.decorators import api_view

from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VoiceGrant
from twilio.jwt.client import ClientCapabilityToken
from twilio.request_validator import RequestValidator
from twilio.twiml.voice_response import VoiceResponse, Dial

import logging

# Get an instance of a logger
logger = logging.getLogger(__name__)


def validate_twilio_request(f):
    """Validates that incoming requests genuinely originated from Twilio"""
    @wraps(f)
    def decorated_function(request, *args, **kwargs):
        # Create an instance of the RequestValidator class
        validator = RequestValidator(settings.TWILIO_AUTH_TOKEN)

        # Validate the request using its URL, POST data, and X-TWILIO-SIGNATURE header
        request_valid = validator.validate(
            request.build_absolute_uri(),
            request.POST,
            request.META.get('HTTP_X_TWILIO_SIGNATURE', ''))

        # Continue processing the request if it's valid, return a 403 error if it's not
        if request_valid:
            return f(request, *args, **kwargs)
        else:
            return HttpResponseForbidden()
    return decorated_function


@api_view(['GET', 'POST'])
def access_token(request):
    """
    This is the token for the swift app.
    :param request:
    :return: string
    """
    account_sid = settings.TWILIO_ACCOUNT_SID
    api_key = settings.TWILIO_API_KEY
    api_key_secret = settings.TWILIO_API_KEY_SECRET
    push_credential_sid = settings.TWILIO_PUSH_CREDENTIAL_SID
    app_sid = settings.TWILIO_APP_SID
    grant = VoiceGrant(
        push_credential_sid=push_credential_sid,
        outgoing_application_sid=app_sid
    )
    access_token = AccessToken(account_sid, api_key, api_key_secret, identity=str(request.user))
    access_token.add_grant(grant)
    data = {'identity': str(request.user), 'token': access_token.to_jwt().decode('utf-8')}
    return JsonResponse(data)


@api_view(['GET', 'POST'])
def capability_token(request):
    """
    :param request:
    :return:
    """
    account_sid = settings.TWILIO_ACCOUNT_SID
    auth_token = settings.TWILIO_AUTH_TOKEN
    app_sid = settings.TWILIO_VOICE_APP_SID
    identity = str(request.user)

    # Create a Capability Token
    capability = ClientCapabilityToken(account_sid, auth_token)
    capability.allow_client_outgoing(app_sid)
    capability.allow_client_incoming(identity)
    token = capability.to_jwt()
    data = {'identity': identity, 'token': token.decode('utf-8')}
    # Return token info as JSON
    return JsonResponse(data)


@api_view(['POST'])
@csrf_exempt
@validate_twilio_request
def incoming(request):
    """
    Entry point for all incoming webapp
    :param request:
    :return: TwiML
    """
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


@api_view(['GET', 'POST'])
@csrf_exempt
@validate_twilio_request
def outgoing(request):
    """
    Initial point for all outgoing calls
    :param request:
    :return:
    """
    resp = VoiceResponse()
    resp.say("Congratulations! You have made your first outbound call! Good bye.")
    # resp.dial(callerId='+15123990458')
    return HttpResponse(str(resp))


########################################################################################################################
#EVERYTHING BELOW HERE are specific for the javascript app and MUST BE REWRITTEN
########################################################################################################################

@require_http_methods(['POST'])
@csrf_exempt
@validate_twilio_request
def voice(request):
    '''This is currently the endpoint that the javascript webapp is using to place calls.'''
    logger.error('REQUEST %s', request.POST)
    phone_pattern = re.compile(r'^[\d\+\-\(\) ]+$')
    resp = VoiceResponse()
    if "To" in request.POST and request.POST['To'] != '':
        dial = Dial(caller_id=settings.TWILIO_PHONE_NUMBER)
        # wrap the phone number or client name in the appropriate TwiML verb
        # by checking if the number given has only digits and format symbols
        if phone_pattern.match(request.POST['To']):
            dial.number(request.POST['To'])
        else:
            dial.client(request.POST['To'])
        resp.append(dial)
    else:
        resp.say('Thanks for calling! Yahooooooooooo!')
    return HttpResponse(str(resp))






