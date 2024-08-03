# Pistone

Generative adversirial prompts

The aim of this project is to make a system that can generate the most
performant prompt for any task.

In order to achive such a compelling goal we are going to try use the same
concept use for the Generative Advesirial Network (GAN).

We will improve an initial prompt by modifing it a number of times, asking an
LLM to produce few options and by evaluating the result for each one of them.

By having a score for each result we will try to improve the one with grater
score.

## Process

The process can be manual or automatic. In the case of manual is the human
deciding which result is better, while in the case of automatic there will be
another LLM result evaluating the results.

### Automatic

- Write the meta-prompt, telling what the user want to achive, describing on
a score of 100, what is 0 and what is 100.

- Set a desirable score or a repetition amount for when to stop.

- Make the LLM generate N different prompts and run them in parallel.

- Another LLM is in charge of giving a score to the result, among what can be
imporved and what was good about the result.

- The prompt with grater score can be then improved by runing again agaist an
LLM that is in charge of improving prompts.
