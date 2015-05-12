# SQS/SNS Playground...

The idea here was to see how easy it was to use sqs/sns together and how fast
I could use them in a few different situations. In particular the workload I am
targeting takes 30-200s total so waiting a huge amount of time to start that work
is a non starter.

The [code](/perf.js) is not particularly smart it creates a sqs queue
dynamically and links it up to a sns topic (also created dynamically) creating a
"fanout" model (note yes you can have infinity sqs queues!) then continues on
sending and receiving messages in parallel (note no http optimization was done here).

Each message contains a json encoded time that gets compared to the current time
when we decode the message...


## Results

Taken over 2k messages.

| Region | Median Round Trip* |
| -------| -------------------|
| same region | 0.33s |
| us-east-1 | 0.757s |
| my laptop | 0.541s |

*Note that the round trip _includes_ the time to send the message simulating the use case of
parallel sender/recievers (YMMV).
