import axios from 'axios';

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function createIndexPattern() {
    const indexPattern = {
        attributes: {
            title: "questions",
            timeFieldName: "@timestamp"
        }
    };

    try {
        await delay(10000);

        const response = await axios.post(
            'http://localhost:5601/api/saved_objects/index-pattern',
            indexPattern,
            {
                headers: {
                    'kbn-xsrf': 'true',
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('Index Pattern Created:', response.data);
    } catch (error) {
        console.error('Error creating index pattern:', error);
    }
}

createIndexPattern();
