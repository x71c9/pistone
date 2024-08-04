I am exploring the idea of generating the perfect prompt by asking an LLM to improve the prompt itself.
The idea is the following and the concept is similar to how the Generative Adversirial Network (GAN) works.
Basically the user insert a prompt, then the system ask the LLM to make 3 slightly different prompts
and test them. In order to test them the system ask the LLM to generate a good user input prompt and
then use it against the new prompts. After the system is going to ask again the LLM to evaluate the result,
by giving a score from 0 to 100 and some feedback. The system is then using the prompt with the highest score 
to start again the process, feeding the LLM also with the feedback on how to improve the new prompt.
I am also keeping the first user prompt to check if the intent has been kept during the iteration.
What do you think about my idea, is there anything that you would suggest to improve? Do you think is going to
work? How should i find the perfect number of iteration and slightly different prompt number? And how good it is gonna work? My goal is to make a system that will generate the perfect prompt, a system that understand right away the intent of the user, even if the user is not good at writing prompt.
The system should self-improve and understand the user to make it more efficient.
Please share all your idea about this.
