from django.conf.urls import url
from django.contrib.auth.decorators import login_required

from . import views

app_name = 'phonecalls'
urlpatterns = [
    url(r'^accessToken', views.access_token, name='accessToken'),
    url(r'^capabilityToken', views.capability_token, name='capabilityToken'),
    url(r'^incoming', views.incoming, name='incoming'),
    url(r'^outgoing', views.outgoing, name='outgoing'),
    url(r'^voice', views.voice, name='voice'),
]