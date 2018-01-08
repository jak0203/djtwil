import re

from django.conf import settings
from django.http import HttpResponse, HttpResponseForbidden, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from functools import wraps
from rest_framework.decorators import api_view

from twilio.jwt.access_token import AccessToken, grants
from twilio.jwt.client import ClientCapabilityToken
from twilio.request_validator import RequestValidator
from twilio.twiml.voice_response import VoiceResponse, Dial

from .models import UserApp

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

        # Continue processing the request if it's valid (or if DEBUG is True), return a 403 error if it's not
        if request_valid or settings.DEBUG:
            return f(request, *args, **kwargs)
        else:
            logger.warning(f'Invalid twilio request: {request}')
            return HttpResponseForbidden()
    return decorated_function


@api_view(['GET', 'POST'])
def access_token(request):
    """
    To be deprecated
    :param request:
    :return: string
    """
    account_sid = settings.TWILIO_ACCOUNT_SID
    api_key = settings.TWILIO_API_KEY
    api_key_secret = settings.TWILIO_API_KEY_SECRET
    push_credential_sid = settings.TWILIO_PUSH_CREDENTIAL_SID
    app_sid = settings.TWILIO_APP_SID
    grant = grants.VoiceGrant(
        push_credential_sid=push_credential_sid,
        outgoing_application_sid=app_sid
    )
    token = AccessToken(account_sid, api_key, api_key_secret, identity=str(request.user))
    token.add_grant(grant)
    data = {'identity': str(request.user), 'token': token.to_jwt().decode('utf-8')}
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
    client = request.GET.get('client', 'unknown')
    user_app, created = UserApp.objects.update_or_create(user=request.user, app=client, is_online=True)
    identity = '_'.join([str(request.user), user_app.app])

    # Create a Capability Token
    capability = ClientCapabilityToken(account_sid, auth_token)
    capability.allow_client_outgoing(app_sid)
    capability.allow_client_incoming(identity)
    token = capability.to_jwt()
    data = {'identity': identity, 'token': token.decode('utf-8')}
    # Return token info as JSON
    return JsonResponse(data)


@require_http_methods(['POST'])
@csrf_exempt
@validate_twilio_request
def incoming(request):
    """
    Entry point for all incoming calls to the twilio phone number
    :param request:
    :return: TwiML
    """
    # Create a new TwiML response
    resp = VoiceResponse()
    dial = Dial(caller_id=settings.TWILIO_PHONE_NUMBER)

    # Temporary - get all clients and dial all of them
    all_web_clients = UserApp.objects.all()
    for web_client in all_web_clients:
        dial.client(web_client.app)

    resp.append(dial)
    logger.info('Incoming call received')
    return HttpResponse(resp)


@api_view(['GET', 'POST'])
@csrf_exempt
@validate_twilio_request
def outgoing(request):
    """
    Used if when making a click to call request from the web, you want connect using your phone instead of using the app
    :param request:
    :return:
    """
    resp = VoiceResponse()
    resp.say("Congratulations! You have made your first outbound call! Good bye.")
    return HttpResponse(str(resp))


@require_http_methods(['POST'])
@csrf_exempt
@validate_twilio_request
def voice(request):
    """
    This is responsible for making the outgoing calls placed by the webapps
    :param request:
    :return:
    """
    phone_pattern = re.compile(r'^[\d+\-]+$')
    resp = VoiceResponse()

    if 'To' in request.POST and request.POST['To'] != '':
        dial = Dial(caller_id=settings.TWILIO_PHONE_NUMBER)
        # wrap the phone number or client name in the appropriate TwiML verb
        # by checking if the number given has only digits and format symbols
        if phone_pattern.match(request.POST['To']):
            dial.number(request.POST['To'])
        else:
            # Currently not being used
            # This allows us to call specific clients instead of phone numbers
            dial.client(request.POST['To'])
        resp.append(dial)
    else:
        resp.say('Please enter a valid phone number.')
        logger.warning(f'Request received without a To field: {request.POST}')
    return HttpResponse(str(resp))


@require_http_methods(['POST'])
@csrf_exempt
@validate_twilio_request
def twilio_callbacks(request):
    return
