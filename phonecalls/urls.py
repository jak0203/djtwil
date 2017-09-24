from django.conf.urls import url

from . import views

app_name = 'phonecalls'
urlpatterns = [
    url(r'^accessToken/', views.token, name='accessToken'),
    url(r'^incoming/', views.incoming, name='incoming'),
    url(r'^outgoing/', views.outgoing, name='outgoing'),
]