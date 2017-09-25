import re

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse, HttpResponseForbidden, JsonResponse
from django.shortcuts import render
from django.template import loader
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt

from functools import wraps
from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VoiceGrant
from twilio.jwt.client import ClientCapabilityToken
from twilio.twiml.voice_response import VoiceResponse, Dial
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

@login_required(login_url='/admin/login/')
def index(request):
    template = loader.get_template('phonecalls/index.html')
    context = {}
    return HttpResponse(template.render(context, request))
    # return HttpResponse('HI!')


@login_required(login_url='/admin/login/')
@require_http_methods(['GET', 'POST'])
def token(request):
    '''This is the token for the javascript web-app. It returns a json object of the token and the app's identity.'''
    account_sid = settings.TWILIO_ACCOUNT_SID
    auth_token = settings.TWILIO_AUTH_TOKEN
    app_sid = settings.TWILIO_VOICE_APP_SID
    # for now create fake identity
    from faker import Factory
    fake = Factory.create()
    alphanumeric_only = re.compile('[\W_]+')
    identity = alphanumeric_only.sub('', fake.user_name())

    # Create a Capability Token
    capability = ClientCapabilityToken(account_sid, auth_token)
    capability.allow_client_outgoing(app_sid)
    capability.allow_client_incoming(identity)
    token = capability.to_jwt()
    data = {'identity': identity, 'token': token.decode('utf-8')}
    # Return token info as JSON
    return JsonResponse(data)


@login_required(login_url='/admin/login/')
@require_http_methods(['GET', 'POST'])
def access_token(request):
    '''This is the token for the swift app. It returns the token as a string.'''
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


@require_http_methods(['POST'])
@csrf_exempt
@validate_twilio_request
def incoming(request):
    '''This will be the first entry point for all incoming calls.'''
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


@require_http_methods(['GET', 'POST'])
@csrf_exempt
@validate_twilio_request
def outgoing(request):
    '''This will be the first point for all outgoing calls.'''
    resp = VoiceResponse()
    resp.say("Congratulations! You have made your first outbound call! Good bye.")
    # resp.dial(callerId='+15123990458')
    return HttpResponse(str(resp))


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
        resp.say('Thanks for calling!')
    return HttpResponse(str(resp))
