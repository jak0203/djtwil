To run app on local

    $ foreman start -f Procfile.local


# Authentication to djtwil api
## get auth token
POST to apiTokenAuth with your username and password to retrieve your api token.
Sample Request

    $ curl -X "POST" "http://localhost:5000/apiTokenAuth/" \
         -H 'Content-Type: application/json; charset=utf-8' \
         -d $'{
      "username": "USERNAME",
      "password": "PASSWORD"
    }'

Sample Response

    HTTP/1.0 200 OK
    Date: Tue, 19 Dec 2017 03:04:09 GMT
    Server: WSGIServer/0.2 CPython/3.5.1
    Content-Type: application/json
    Allow: POST, OPTIONS
    X-Frame-Options: SAMEORIGIN
    Content-Length: 52
    Vary: Cookie
    
    {"token":"XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"}

## get twilio token
GET phonecalls/twilioAccessToken/ - pass the api token in as a header to the request
Sample Request

    $ curl "http://localhost:5000/phonecalls/twilioAccessToken/" \
         -H 'Authorization: Token XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' \
         -H 'Accept: application/json'

Sample Response (token is returned as a string):

    HTTP/1.0 200 OK
    Date: Tue, 19 Dec 2017 03:02:41 GMT
    Server: WSGIServer/0.2 CPython/3.5.1
    X-Frame-Options: SAMEORIGIN
    Allow: OPTIONS, POST, GET
    Vary: Accept
    Content-Length: 575
    Content-Type: text/html; charset=utf-8
    
    VERY_LONG_TOKEN



# Heroku Django Starter Template

An utterly fantastic project starter template for Django 1.11.

## Features

- Production-ready configuration for Static Files, Database Settings, Gunicorn, etc.
- Enhancements to Django's static file serving functionality via WhiteNoise.
- Latest Python 3.6 runtime environment. 

## How to Use

To use this project, follow these steps:

1. Create your working environment.
2. Install Django (`$ pip install django`)
3. Create a new project using this template

## Creating Your Project

Using this template to create a new Django app is easy::

    $ django-admin.py startproject --template=https://github.com/heroku/heroku-django-template/archive/master.zip --name=Procfile helloworld

(If this doesn't work on windows, replace `django-admin.py` with `django-admin`)

You can replace ``helloworld`` with your desired project name.

## Deployment to Heroku

    $ git init
    $ git add -A
    $ git commit -m "Initial commit"

    $ heroku create
    $ git push heroku master

    $ heroku run python manage.py migrate

See also, a [ready-made application](https://github.com/heroku/python-getting-started), ready to deploy.

## Using Python 2.7?

Just update `runtime.txt` to `python-2.7.13` (no trailing spaces or newlines!).


## License: MIT

## Further Reading

- [Gunicorn](https://warehouse.python.org/project/gunicorn/)
- [WhiteNoise](https://warehouse.python.org/project/whitenoise/)
- [dj-database-url](https://warehouse.python.org/project/dj-database-url/)
