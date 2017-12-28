# Django-Twilio Backend + React Dialer
A django backend server to handle Twilio calls and a frontend React web dialer.

### Prerequisites
1. Python (version 3.6 or higher)
2. Pip
3. Node.js (version 6 or higher)
4. A Twilio account with a phone number
5. Ngrok

### Local Development
1. Clone this repository and cd into it
    ```
    $ git clone git@github.com:jak0203/djtwil.git
    $ cd djtwil
    ```
2. Set up a virtual environment
    ```
    $ virtualenv {VIRTUALENV NAME} -p python3.6
    $ source {VIRTUALENV NAME}/bin/activate
    ```
3. Install the python requirements
    ```
    $ pip install -r requirements.txt
    ```
4. Cd into the webapp directory and install react
    ```
    $ cd webapp
    $ npm install
    $ cd ..
    ```
5. Copy the .env.SAMPLE file to .env
    ```
    $ cp .env.SAMPLE .env
    ```
If you want to use a postgres db instead of sql lite, uncomment line 4 and update the URL with your postgres db information.

6. Set up ngrok
If you don't already have a server configured to use as your webhook, [ngrok](https://ngrok.com/) is a great tool for testing webhooks locally.
Once you have your ngrok URL, paste it into the .env file.
If you are using a free ngrok account, you'll need to remove line 1 from the Procfile.local and run ngrok in a separate terminal window.

7. Set up Twilio
Log into your [twilio](https://www.twilio.com/) account and gather the account information into the .env file.
The account SID and token should be found on your main [dashboard](https://www.twilio.com/console).
The rest API key and secret should be under the [programable voice dashboard](https://www.twilio.com/console/voice/runtime/api-keys).
The push credential sid should be under the [programmable voice credentials](https://www.twilio.com/console/voice/credentials).

Set up the following twiml apps.
a. Voice
Request URL: https://{NGROK URL}.ngrok.io/phonecalls/voice/
Copy the Application SID into the .env file TWILIO_VOICE_APP_SID
b. Outgoing
Request URL: https://{NGROK URL}.ngrok.io/phonecalls/outgoing/
Copy the Application SID into the .env file TWILIO_APP_SID
c. Incoming
Request URL: https://{NGROK URL}.ngrok.io/phonecalls/incoming/
Under your phone number, voice and fax; Set the accept incoming voice calls configure with a TwiML App and select the incoming twiml app just created.

8. Run database migrations
    ```
    $ python manage.py migrate
    ```
9. Create superuser
    ```
    python manage.py createsuperuser
    ```
10. Start servers
    ```
    $ honcho start -f Procfile.local
    ```
11. Login by navigating to http://localhost:5000/admin/

### Deploy to Heroku


### Development notes
#### get auth token
POST to api/token with your username and password to retrieve your api token.
Sample Request

    $ curl -X "POST" "http://localhost:5000/api/token/" \
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

#### get twilio token
GET phonecalls/capabilityToken/ - pass the api token in as a header to the request
Sample Request

    $ curl "http://localhost:5000/phonecalls/capabilityToken/" \
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
    
    {"identity": USER, "token": VERY_LONG_TOKEN}


#### License: MIT

#### Further Reading

- [Gunicorn](https://warehouse.python.org/project/gunicorn/)
- [WhiteNoise](https://warehouse.python.org/project/whitenoise/)
- [dj-database-url](https://warehouse.python.org/project/dj-database-url/)
