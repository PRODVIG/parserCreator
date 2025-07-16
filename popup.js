let user_info_block = document.getElementById("user").querySelector('span');
let logout = document.getElementById("logout");

chrome.storage.local.get(['user_data', 'webhook_url']).then((res) => {
    const user_info = res.user_data;
    const webhook_url = res.webhook_url;

    if (!webhook_url) {
        alert("Webhook URL не найден. Пожалуйста, вернитесь на страницу авторизации и введите URL.");
        location.href = "/index.html";
        return;
    }

    user_info_block.innerHTML = `${user_info.NAME} ${user_info.LAST_NAME}`;
});

const saveToBitrixBtn = document.getElementById("saveToBitrix");
const loader = document.getElementById("loader");
const status_mess = document.getElementById("status_mess");

logout.addEventListener("click", () => {
    chrome.storage.local.clear(() => {
        location.href = "/index.html";
    });
});

saveToBitrixBtn.addEventListener("click", (e) => {
    loader.style.display = "block";
    status_mess.innerHTML = "";
    e.target.disabled = true;

    // Устанавливаем таймаут на случай, если что-то пойдет не так
    const timeoutId = setTimeout(() => {
        loader.style.display = "none";
        saveToBitrixBtn.disabled = false;
        displayStatus("Превышено время ожидания. Попробуйте еще раз.", 'red');
    }, 30000); // 30 секунд

    chrome.tabs.query({ active: true }, function (tabs) {
        const tab = tabs[0];
        if (tab) {
            execScript2(tab, timeoutId);
        } else {
            clearTimeout(timeoutId);
            loader.style.display = "none";
            saveToBitrixBtn.disabled = false;
            alert("Нет активных вкладок");
        }
    });
});

function execScript2(tab, timeoutId) {
    chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: false },
        func: () => {
            const show_contact = document.querySelector('[data-qa="response-resume_show-phone-number"]');
            if (show_contact) {
                show_contact.click();
            }
        }
    }).then(() => {
        setTimeout(() => {
            chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: false },
                func: getVacancyInfo
            }).then((Resume) => {
                clearTimeout(timeoutId); // Очищаем таймаут при успешном выполнении
                sendToBitrix(Resume[0].result);
            }).catch((error) => {
                clearTimeout(timeoutId);
                console.error('Ошибка при выполнении скрипта:', error);
                loader.style.display = "none";
                saveToBitrixBtn.disabled = false;
                displayStatus('Ошибка при извлечении данных со страницы', 'red');
            });
        }, 3000);
    }).catch((error) => {
        clearTimeout(timeoutId);
        console.error('Ошибка при клике на показать контакты:', error);
        loader.style.display = "none";
        saveToBitrixBtn.disabled = false;
        displayStatus('Ошибка при доступе к странице', 'red');
    });
}

function getVacancyInfo() {
    function currentDate() {
        const currentDate = new Date();
        const day = currentDate.getDate().toString().padStart(2, '0');
        const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
        const year = currentDate.getFullYear();
        return `${day}.${month}.${year}`;
    }

    try {
        const vacancy = {};
        const resume = {};

        vacancy.resumeLink = window.location.href;
        vacancy.resumeId = window.location.pathname.split("/")[2] || "";

        // Отладочная информация для resumeId
        console.log('URL страницы:', window.location.href);
        console.log('Путь:', window.location.pathname);
        console.log('Извлеченный resumeId:', vacancy.resumeId);

        const vacancyNameElem = document.querySelector('div[data-qa="resume-history-sidebar-container"] div[data-qa="resume-history-item"] a');
        vacancy.vacancyName = vacancyNameElem ? vacancyNameElem.innerText.trim() : "";

        const commentBlock = document.querySelectorAll('div[data-qa="resume-comments"] div[data-qa="resume-comment-item"]');
        if (commentBlock && commentBlock.length > 0) {
            vacancy.comments = Array.from(commentBlock).map(item => {
                const commentText = item.querySelector('span[data-qa="comment__text"]');
                const commentInfo = item.querySelector('div.resume-sidebar-item__info');
                return (commentText ? commentText.innerText : '') + "\n" +
                       (commentInfo ? commentInfo.innerText : '') + "\n\n";
            }).join("");
        } else {
            vacancy.comments = "";
        }

        // Собираем персональную информацию
        const genderElem = document.querySelector('span[data-qa="resume-personal-gender"]');
        vacancy.gender = genderElem ? genderElem.innerText.trim() : "";

        const ageElem = document.querySelector('span[data-qa="resume-personal-age"]');
        vacancy.age = ageElem ? ageElem.innerText.split(' ')[0] : "";

        const addressElem = document.querySelector('span[data-qa="resume-personal-address"]');
        vacancy.address = addressElem ? addressElem.innerText.trim() : "";

        // Собираем опыт работы
        const experienceTitle = document.querySelector('[data-qa="resume-experience-block-title"] h2');
        let experienceText = experienceTitle ? experienceTitle.innerText.trim() + '\n\n' : '';

        // Находим все контейнеры опыта работы
        const experienceContainers = document.querySelectorAll('.magritte-h-spacing-container___rrYJZ_2-0-58');
        let experienceDetails = [];

        experienceContainers.forEach(container => {
            // Проверяем, есть ли в контейнере данные об опыте
            const positionElem = container.querySelector('[data-qa="resume-block-experience-position"]');
            const companyElem = container.querySelector('[data-qa="resume-experience-company-title"]');
            const periodElem = container.querySelector('[data-qa="resume-experience-period"]');
            const descriptionElem = container.querySelector('[data-qa="resume-block-experience-description"]');

            if (positionElem && companyElem) {
                const position = positionElem.innerText.trim();
                const company = companyElem.innerText.trim();
                const period = periodElem ? periodElem.innerText.trim() : '';
                const description = descriptionElem ? descriptionElem.innerText.trim() : '';

                let experienceEntry = `${position} в ${company}`;
                if (period) experienceEntry += `\n${period}`;
                if (description) experienceEntry += `\n${description}`;

                experienceDetails.push(experienceEntry);
            }
        });

        if (experienceDetails.length > 0) {
            vacancy.experience = experienceText + experienceDetails.join('\n\n');
        } else {
            vacancy.experience = experienceText || "";
        }

        // Собираем образование
        const educationTitle = document.querySelector('[data-qa="resume-education-block-title"] h2');
        let educationText = educationTitle ? educationTitle.innerText.trim() + '\n\n' : '';

        // Собираем высшее образование
        let educationDetails = [];
        
        // Ищем блок высшего образования
        const educationBlock = document.querySelector('[data-qa="resume-education-block"]');
        if (educationBlock) {
            const institutionElem = educationBlock.querySelector('a span');
            const specialtyElem = educationBlock.querySelector('.magritte-text_style-secondary___1IU11_4-0-0 span');
            const yearElem = educationBlock.querySelector('.magritte-text_style-tertiary___ANX5P_4-0-0');

            if (institutionElem) {
                let educationEntry = institutionElem.innerText.trim();
                if (specialtyElem) educationEntry += `\n${specialtyElem.innerText.trim()}`;
                if (yearElem) educationEntry += `\n${yearElem.innerText.trim()}`;
                educationDetails.push(educationEntry);
            }
        }

        // Собираем курсы повышения квалификации
        const coursesTitle = document.querySelector('[data-qa="resume-education-courses-block-title"] h2');
        if (coursesTitle) {
            educationDetails.push(`\n${coursesTitle.innerText.trim()}`);
        }

        const coursesBlocks = document.querySelectorAll('[data-qa="resume-education-courses-block"] .magritte-cell___NQYg5_6-0-1');
        coursesBlocks.forEach(courseBlock => {
            const courseNameElem = courseBlock.querySelector('.magritte-text_style-primary___AQ7MW_4-0-0 span');
            const courseOrgElem = courseBlock.querySelector('.magritte-text_style-secondary___1IU11_4-0-0 span');
            const courseYearElem = courseBlock.querySelector('.magritte-text_style-tertiary___ANX5P_4-0-0');

            if (courseNameElem) {
                let courseEntry = `Курс: ${courseNameElem.innerText.trim()}`;
                if (courseOrgElem) courseEntry += `\nОрганизация: ${courseOrgElem.innerText.trim()}`;
                if (courseYearElem) courseEntry += `\nГод: ${courseYearElem.innerText.trim()}`;
                educationDetails.push(courseEntry);
            }
        });

        if (educationDetails.length > 0) {
            vacancy.education = educationText + educationDetails.join('\n\n');
        } else {
            vacancy.education = educationText || "";
        }

        // Собираем ключевые навыки
        const skillsTitle = document.querySelector('[data-qa="resume-skills-block-title"] h2');
        let skillsText = skillsTitle ? skillsTitle.innerText.trim() + '\n\n' : '';

        // Ищем навыки по уровням
        let skillsByLevel = [];

        // Продвинутый уровень
        const advancedTitle = document.querySelector('[data-qa="skill-level-title-3"]');
        if (advancedTitle) {
            const advancedContainer = advancedTitle.closest('.magritte-v-spacing-container___mkW1c_2-0-57');
            const advancedSkills = advancedContainer?.querySelectorAll('.magritte-tag__label___YHV-o_3-1-32 span');
            if (advancedSkills && advancedSkills.length > 0) {
                const skills = Array.from(advancedSkills).map(skill => skill.innerText.trim()).join(', ');
                skillsByLevel.push(`Продвинутый уровень: ${skills}`);
            }
        }

        // Средний уровень
        const mediumTitle = document.querySelector('[data-qa="skill-level-title-2"]');
        if (mediumTitle) {
            const mediumContainer = mediumTitle.closest('.magritte-v-spacing-container___mkW1c_2-0-57');
            const mediumSkills = mediumContainer?.querySelectorAll('.magritte-tag__label___YHV-o_3-1-32 span');
            if (mediumSkills && mediumSkills.length > 0) {
                const skills = Array.from(mediumSkills).map(skill => skill.innerText.trim()).join(', ');
                skillsByLevel.push(`Средний уровень: ${skills}`);
            }
        }

        // Начальный уровень
        const beginnerTitle = document.querySelector('[data-qa="skill-level-title-1"]');
        if (beginnerTitle) {
            const beginnerContainer = beginnerTitle.closest('.magritte-v-spacing-container___mkW1c_2-0-57');
            const beginnerSkills = beginnerContainer?.querySelectorAll('.magritte-tag__label___YHV-o_3-1-32 span');
            if (beginnerSkills && beginnerSkills.length > 0) {
                const skills = Array.from(beginnerSkills).map(skill => skill.innerText.trim()).join(', ');
                skillsByLevel.push(`Начальный уровень: ${skills}`);
            }
        }

        if (skillsByLevel.length > 0) {
            vacancy.skills = skillsText + skillsByLevel.join('\n\n');
        } else {
            // Альтернативный поиск навыков без уровней
            const skillItems = document.querySelectorAll('[data-qa="resume-block-skills-item"]');
            if (skillItems.length > 0) {
                const skills = Array.from(skillItems).map(item => item.innerText.trim()).join(', ');
                vacancy.skills = skillsText + skills;
            } else {
                // Ищем любые навыки в тегах (исключая языки)
                const skillTags = document.querySelectorAll('.magritte-tag__label___YHV-o_3-1-32 span');
                if (skillTags.length > 0) {
                    const tagSkills = Array.from(skillTags).map(tag => tag.innerText.trim()).filter(text =>
                        text && !text.includes('Казахский') && !text.includes('Русский') && !text.includes('Английский') &&
                        !text.includes('Немецкий') && !text.includes('WhatsApp') && !text.includes('Viber') && !text.includes('Telegram')
                    ).join(', ');
                    vacancy.skills = skillsText + tagSkills;
                } else {
                    vacancy.skills = skillsText || "";
                }
            }
        }

        // Собираем желаемую зарплату
        const salaryElem = document.querySelector('[data-qa="resume-salary-expectation"] h2');
        if (salaryElem) {
            vacancy.salary = salaryElem.innerText.trim();
        } else {
            vacancy.salary = "";
        }

        // Собираем желаемую должность
        const positionElem = document.querySelector('[data-qa="resume-position"] h2');
        if (positionElem) {
            vacancy.position = positionElem.innerText.trim();
        } else {
            vacancy.position = "";
        }

        // Собираем языки
        const languageItems = document.querySelectorAll('[data-qa="resume-block-language-item"]');
        if (languageItems.length > 0) {
            vacancy.languages = Array.from(languageItems).map(item => item.innerText.trim()).join(', ');
        } else {
            vacancy.languages = "";
        }

        // Собираем информацию "О кандидате"
        const aboutCandidateBlocks = document.querySelectorAll('.magritte-card___bhGKz_8-0-0');
        let aboutCandidate = '';

        aboutCandidateBlocks.forEach(card => {
            const textContent = card.querySelector('.magritte-text_typography-paragraph-3-regular___tEZmr_4-0-0 span');
            if (textContent && textContent.innerText.length > 100) { // Длинный текст скорее всего "О кандидате"
                aboutCandidate = textContent.innerText.trim();
            }
        });

        vacancy.aboutCandidate = aboutCandidate;

        vacancy.date = currentDate();

        const nameElem = document.querySelector('[data-qa="resume-personal-name"] span');
        if (nameElem) {
            const full_name = nameElem.innerText.trim().split(' ');
            resume.NAME = full_name[1] || "";
            resume.LAST_NAME = full_name[0] || "";
        } else {
            resume.NAME = "";
            resume.LAST_NAME = "";
        }

        // Ищем телефон в разных возможных местах
        let phone_block = document.querySelector('[data-qa="resume-contact-phone"] > a');
        if (!phone_block) {
            phone_block = document.querySelector('[data-qa="resume-contact-phone"]');
        }
        if (!phone_block) {
            // Дополнительные селекторы для поиска телефона
            phone_block = document.querySelector('div[data-qa="resume-contact-phone"]');
        }
        if (!phone_block) {
            // Ищем по классам, если data-qa не работает
            phone_block = document.querySelector('.resume-contact-phone');
        }

        if (phone_block && phone_block.innerText.trim()) {
            const phoneText = phone_block.innerText.trim();
            resume.PHONE = [{ VALUE: phoneText, VALUE_TYPE: 'WORK' }];
        }

        const email_block = document.querySelector('[data-qa="resume-contact-email"] span');
        if (email_block && email_block.innerText.trim()) {
            resume.EMAIL = [{ VALUE: email_block.innerText.trim(), VALUE_TYPE: 'WORK' }];
        }

        // Добавляем resume в vacancy для удобства доступа
        vacancy.resume = resume;

        // Отладочная информация
        console.log('Собранные данные резюме:', resume);
        console.log('Собранные данные вакансии:', vacancy);

        return { resume, vacancy };
    } catch (error) {
        console.error('Ошибка при извлечении данных со страницы:', error);
        return null;
    }
}

function sendToBitrix(data = null) {
    if (!data) {
        loader.style.display = "none";
        status_mess.innerHTML = "<h3 style='color: red'>Что-то пошло не так!</h3>";
        saveToBitrixBtn.disabled = false;
        return;
    }
    saveToBitrixBtn.disabled = true;

    chrome.storage.local.get(['webhook_url', 'user_data']).then((res) => {
        const webhook_url = res.webhook_url;
        const user_info = res.user_data;

        if (!webhook_url) {
            alert("Webhook URL не найден. Пожалуйста, вернитесь на страницу авторизации.");
            location.href = "/index.html";
            return;
        }

        try {
            console.log('=== НАЧАЛО ОБРАБОТКИ ===');
            const contact_id = handleContact(data.resume, data.vacancy, webhook_url, user_info);
            console.log('Получен contact_id:', contact_id);
            if (contact_id) {
                console.log('=== КОНТАКТ ОБРАБОТАН ===');
                displayStatus('Контакт успешно обработан', 'green');
            } else {
                console.log('contact_id не получен');
            }
        } catch (error) {
            console.error('Ошибка при обработке данных:', error);
            displayStatus('Произошла ошибка при обработке данных', 'red');
        } finally {
            // Всегда скрываем лоадер и включаем кнопку обратно
            loader.style.display = "none";
            saveToBitrixBtn.disabled = false;
        }
    });
}

function handleContact(resume, vacancy, webhook_url, user_info) {
    try {
        // Проверяем наличие телефона
        if (!resume.PHONE || !resume.PHONE[0] || !resume.PHONE[0].VALUE) {
            displayStatus("Не найден номер телефона в резюме. Проверьте, что телефон отображается на странице.", 'red');
            return null;
        }

        // Формируем комментарий с информацией о кандидате
        const comments = buildContactComments(vacancy);

        const contactExists = callAjax(`${webhook_url}/crm.contact.list`, {
            filter: { PHONE: resume.PHONE[0].VALUE }
        }, 'post');

        if (contactExists?.result?.length) {
            const contact = contactExists.result[0];
            
            // Обновляем существующий контакт с комментарием
            const updateData = {
                id: contact.ID,
                fields: { 
                    COMMENTS: comments
                }
            };
            
            const updated_contact = callAjax(`${webhook_url}/crm.contact.update`, updateData, 'post');

            if (updated_contact?.result) {
                displayStatus(`Контакт обновлен: ${contact.LAST_NAME} ${contact.NAME}`, 'green');
            } else {
                displayStatus("Ошибка обновления контакта.", 'red');
                if (updated_contact?.error) {
                    displayStatus(`Ошибка: ${updated_contact.error}`, 'red');
                }
            }
            return contact.ID;
        }

        // Создаем новый контакт с комментарием
        const newContactData = {
            fields: { 
                ...resume, 
                ASSIGNED_BY_ID: user_info.ID,
                COMMENTS: comments
            }
        };
        
        const new_contact = callAjax(`${webhook_url}/crm.contact.add`, newContactData, 'post');

        if (new_contact?.result) {
            displayStatus(`Контакт успешно создан: ${resume.LAST_NAME} ${resume.NAME}`, 'green');
            return new_contact.result;
        }

        displayStatus("Ошибка создания контакта.", 'red');
        if (new_contact?.error) {
            displayStatus(`Ошибка: ${new_contact.error}`, 'red');
        }
        if (new_contact?.error_description) {
            displayStatus(`Детали: ${new_contact.error_description}`, 'red');
        }
        return null;
    } catch (error) {
        displayStatus(`Критическая ошибка: ${error.message}`, 'red');
        return null;
    }
}

function buildContactComments(vacancy) {
    let comments = `=== ИНФОРМАЦИЯ О КАНДИДАТЕ ===\n`;
    comments += `Имя: ${vacancy.resume?.LAST_NAME || ''} ${vacancy.resume?.NAME || ''}\n`;
    comments += `Возраст: ${vacancy.age || 'не указан'}\n`;
    comments += `Пол: ${vacancy.gender || 'не указан'}\n`;
    comments += `Адрес: ${vacancy.address || 'не указан'}\n`;

    if (vacancy.position && vacancy.position.trim()) {
        comments += `Желаемая должность: ${vacancy.position}\n`;
    }

    if (vacancy.salary && vacancy.salary.trim()) {
        comments += `Желаемая зарплата: ${vacancy.salary}\n`;
    }

    if (vacancy.languages && vacancy.languages.trim()) {
        comments += `Языки: ${vacancy.languages}\n`;
    }

    comments += `Дата обработки: ${vacancy.date}\n`;
    comments += `Ссылка на резюме: ${vacancy.resumeLink}\n\n`;

    // Сокращаем опыт работы - только последние 3 места
    if (vacancy.experience && vacancy.experience.trim()) {
        const experienceLines = vacancy.experience.split('\n\n');
        const shortExperience = experienceLines.slice(0, 4).join('\n\n'); // Заголовок + 3 места работы
        comments += `=== ОПЫТ РАБОТЫ ===\n${shortExperience}\n\n`;
    } else {
        comments += `=== ОПЫТ РАБОТЫ ===\nНе указан\n\n`;
    }

    // Сокращаем образование - только основное
    if (vacancy.education && vacancy.education.trim()) {
        const educationLines = vacancy.education.split('\n\n');
        const shortEducation = educationLines.slice(0, 2).join('\n\n'); // Заголовок + основное образование
        comments += `=== ОБРАЗОВАНИЕ ===\n${shortEducation}\n\n`;
    } else {
        comments += `=== ОБРАЗОВАНИЕ ===\nНе указано\n\n`;
    }

    // Сокращаем навыки - только основные
    if (vacancy.skills && vacancy.skills.trim()) {
        const skillsLines = vacancy.skills.split('\n\n');
        const shortSkills = skillsLines.slice(0, 2).join('\n\n'); // Заголовок + основные навыки
        comments += `=== КЛЮЧЕВЫЕ НАВЫКИ ===\n${shortSkills}\n\n`;
    } else {
        comments += `=== КЛЮЧЕВЫЕ НАВЫКИ ===\nНе указаны\n\n`;
    }

    // О кандидате - только первые 300 символов
    if (vacancy.aboutCandidate && vacancy.aboutCandidate.trim()) {
        const shortAbout = vacancy.aboutCandidate.length > 300 
            ? vacancy.aboutCandidate.substring(0, 300) + '...'
            : vacancy.aboutCandidate;
        comments += `=== О КАНДИДАТЕ ===\n${shortAbout}\n\n`;
    }

    // HR комментарии - только первые 200 символов
    if (vacancy.comments && vacancy.comments.trim()) {
        const shortComments = vacancy.comments.length > 200
            ? vacancy.comments.substring(0, 200) + '...'
            : vacancy.comments;
        comments += `=== КОММЕНТАРИИ HR ===\n${shortComments}\n`;
    }

    // Проверяем общую длину и обрезаем если нужно
    if (comments.length > 3000) {
        comments = comments.substring(0, 2950) + '\n\n[...данные обрезаны...]';
    }

    return comments;
}

function callAjax(url, data = null, method = 'post') {
    let result = null;
    try {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, false);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        result = JSON.parse(xhr.responseText);
                        
                        // Дополнительная проверка структуры ответа Bitrix24
                        if (result && typeof result === 'object') {
                            // Если есть ошибка в ответе Bitrix24
                            if (result.error) {
                                console.error('Ошибка API Bitrix24:', result.error, result.error_description);
                            }
                            // Если result не определен, устанавливаем пустой массив
                            if (result.result === undefined) {
                                result.result = [];
                            }
                        }
                    } catch (parseError) {
                        console.error('Ошибка парсинга JSON:', parseError);
                        result = { error: 'Ошибка парсинга ответа сервера', result: [] };
                    }
                } else {
                    console.error(`HTTP Error: ${xhr.status} - ${xhr.statusText}`);
                    result = { error: `HTTP Error: ${xhr.status}`, result: [] };
                }
            }
        };
        xhr.send(JSON.stringify(data));
        
    } catch (error) {
        console.error('Ошибка AJAX запроса:', error);
        result = { error: 'Ошибка сетевого запроса', result: [] };
    }
    return result;
}

function displayStatus(message, color) {
    const div = document.createElement('div');
    div.innerHTML = message;
    div.style.marginBottom = '5px';
    div.style.padding = '5px';
    div.style.borderRadius = '3px';

    // Устанавливаем цвет в зависимости от типа сообщения
    switch(color) {
        case 'green':
            div.style.color = '#4CAF50';
            div.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
            break;
        case 'red':
            div.style.color = '#f44336';
            div.style.backgroundColor = 'rgba(244, 67, 54, 0.1)';
            break;
        case 'orange':
            div.style.color = '#ff9800';
            div.style.backgroundColor = 'rgba(255, 152, 0, 0.1)';
            break;
        default:
            div.style.color = color;
    }

    status_mess.appendChild(div);
}